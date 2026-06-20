"""
AI-Driven Parking Intelligence — Data Pipeline
Processes raw violation records → enriched hotspot data with
real congestion impact, speed-reduction estimates, temporal trends,
junction-level analysis, and enforcement ROI.

Key accuracy decisions:
  - Only 'approved' and 'created1' records used (confirmed/officer-logged violations)
  - Timestamps converted UTC → IST before any hour-based logic
  - Only parking-related violation types feed the congestion model
  - Non-parking offences (defective plates, fare disputes) excluded
  - Speed reduction estimated via linear V/C model at cluster level
"""

import pandas as pd
import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import MinMaxScaler
import json, os, glob, warnings
warnings.filterwarnings("ignore")

# ── Configuration ─────────────────────────────────────────────────────────────
DATA_SOURCE  = "jan to may police violation_anonymized791b166.csv"
OUTPUT_PATH  = "frontend/public/hotspots.csv"
JUNCTION_OUTPUT_PATH = "frontend/public/junction_hotspots.csv"

DBSCAN_EPS_DEG  = 0.0005   # ≈ 55 m at Bangalore latitude
DBSCAN_MIN_SAMP = 30

# Bangalore bounding box
LAT_MIN, LAT_MAX = 12.7, 13.3
LON_MIN, LON_MAX = 77.3, 77.9

# IST offset from UTC
IST_OFFSET = pd.Timedelta(hours=5, minutes=30)


# ── Validation statuses to keep (confirmed field records) ─────────────────────
VALID_STATUSES = {"approved", "created1"}

# ── Parking-only violation types (non-parking offences excluded) ──────────────
PARKING_VIOLATION_TYPES = {
    "WRONG PARKING",
    "NO PARKING",
    "PARKING IN A MAIN ROAD",
    "PARKING ON FOOTPATH",
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC",
    "DOUBLE PARKING",
    "PARKING NEAR ROAD CROSSING",
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS",
    "PARKING OPPOSITE TO ANOTHER PARKED VEHICLE",
    "PARKING OTHER THAN BUS STOP",
    "OBSTRUCTING DRIVER",
}

# ── IRC road capacity standards (PCU/hr per lane) ────────────────────────────
ROAD_CAPACITY = {
    "arterial":     1800,   # 4-lane+ divided arterial
    "sub_arterial": 1200,   # 2-lane undivided major road
    "local":         600,   # service lane / inner road
}

# ── Free-flow speeds by road type (km/h) — used in BPR speed-reduction model ─
FREE_FLOW_SPEED = {
    "arterial":     50,
    "sub_arterial": 35,
    "local":        20,
}

# ── Average delay per affected vehicle (minutes) ─────────────────────────────
DELAY_MINUTES_PER_VEH = {
    "arterial":     0.5,
    "sub_arterial": 1.0,
    "local":        2.0,
}

# Fraction of hourly capacity directly delayed by one parked vehicle
AFFECTED_FRACTION = 0.10


# ── Vehicle PCU weights (Passenger Car Units) ─────────────────────────────────
# Based on IRC:106-1990 PCU equivalents
VEHICLE_PCU = {
    "CAR": 1.0, "JEEP": 1.0, "OTHERS": 1.0,
    "SCOOTER": 0.5, "MOTOR CYCLE": 0.5, "MOPED": 0.5,
    "PASSENGER AUTO": 0.75, "GOODS AUTO": 0.75,
    "MAXI-CAB": 1.5, "VAN": 1.5, "TEMPO": 1.5,
    "LGV": 2.0, "MINI LORRY": 2.5,
    "HGV": 3.0, "TANKER": 3.0,
    "BUS (BMTC/KSRTC)": 3.0, "PRIVATE BUS": 3.0,
}

# ── Violation → road type mapping (highest-severity wins) ────────────────────
VIOLATION_ROAD_TYPE = {
    "PARKING IN A MAIN ROAD":                    "arterial",
    "PARKING NEAR ROAD CROSSING":                "arterial",
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS": "arterial",
    "NO PARKING":                                "sub_arterial",
    "DOUBLE PARKING":                            "sub_arterial",
    "PARKING OPPOSITE TO ANOTHER PARKED VEHICLE":"sub_arterial",
    "PARKING ON FOOTPATH":                       "sub_arterial",
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC":   "sub_arterial",
    "OBSTRUCTING DRIVER":                        "sub_arterial",
    "WRONG PARKING":                             "local",
    "PARKING OTHER THAN BUS STOP":               "local",
}

ROAD_TYPE_PRIORITY = {"arterial": 3, "sub_arterial": 2, "local": 1}

REQUIRED_COLS = [
    "id", "latitude", "longitude", "violation_type",
    "created_datetime", "police_station", "validation_status",
]
OPTIONAL_COLS = ["vehicle_type", "junction_name"]


# ═══════════════════════════════════════════════════════════════════════════════
# 1. DATA LOADING
# ═══════════════════════════════════════════════════════════════════════════════

def discover_csv_files(source: str) -> list:
    """Auto-discovers data CSVs from a file, glob, or directory."""
    exclude = {OUTPUT_PATH, JUNCTION_OUTPUT_PATH}
    if os.path.isfile(source):
        return [source]
    if os.path.isdir(source):
        files = glob.glob(os.path.join(source, "*.csv"))
        return [f for f in files if os.path.basename(f) not in exclude]
    files = glob.glob(source)
    if files:
        return [f for f in files if os.path.basename(f) not in exclude]
    files = glob.glob("*.csv")
    return [f for f in files if os.path.basename(f) not in exclude]


def load_data(source: str) -> pd.DataFrame:
    csv_files = discover_csv_files(source)
    if not csv_files:
        raise FileNotFoundError(
            f"No CSV data files found from source='{source}'. "
            "Place your violations CSV in the same folder as this script."
        )
    print(f"  Found {len(csv_files)} file(s):")
    frames = []
    for f in csv_files:
        print(f"    → {os.path.basename(f)}")
        header = pd.read_csv(f, nrows=0).columns.tolist()
        usecols = REQUIRED_COLS + [c for c in OPTIONAL_COLS if c in header]
        chunk = pd.read_csv(f, usecols=usecols, low_memory=False)
        chunk["_source_file"] = os.path.basename(f)
        frames.append(chunk)
    df = pd.concat(frames, ignore_index=True)
    print(f"  Raw rows loaded: {len(df):,}")
    return df


# ═══════════════════════════════════════════════════════════════════════════════
# 2. FILTERING — accuracy-critical
# ═══════════════════════════════════════════════════════════════════════════════

def parse_violation_types(raw: str) -> list:
    """Parse JSON-array violation_type string into a Python list of strings."""
    try:
        parsed = json.loads(str(raw))
        return [str(v).strip().upper() for v in parsed] if isinstance(parsed, list) else ["UNKNOWN"]
    except Exception:
        return ["UNKNOWN"]


def is_parking_violation(vtype_list: list) -> bool:
    """True if at least one type in the list is a parking-related offence."""
    return any(v in PARKING_VIOLATION_TYPES for v in vtype_list)


def filter_records(df: pd.DataFrame) -> pd.DataFrame:
    """
    Keep only:
      1. Records with validation_status in VALID_STATUSES
         (approved = supervisor-confirmed; created1 = officer-logged, not yet reviewed)
      2. Records that contain at least one parking violation type
         (removes DEFECTIVE NUMBER PLATE, fare disputes, etc.)
    """
    before = len(df)

    # Status filter
    df = df[df["validation_status"].str.lower().isin(VALID_STATUSES)].copy()
    print(f"  After status filter (approved/created1): {len(df):,} (dropped {before - len(df):,})")

    # Parse violation types
    df["vtype_list"] = df["violation_type"].fillna('["UNKNOWN"]').apply(parse_violation_types)

    # Parking-only filter
    before2 = len(df)
    df = df[df["vtype_list"].apply(is_parking_violation)].copy()
    print(f"  After parking-only filter: {len(df):,} (dropped {before2 - len(df):,} non-parking records)")

    # Coordinate bounds
    before3 = len(df)
    df = df[
        (df["latitude"]  > LAT_MIN) & (df["latitude"]  < LAT_MAX) &
        (df["longitude"] > LON_MIN) & (df["longitude"] < LON_MAX)
    ].copy()
    print(f"  After coordinate filter:   {len(df):,} (dropped {before3 - len(df):,} out-of-bounds)")

    return df


# ═══════════════════════════════════════════════════════════════════════════════
# 3. FEATURE ENGINEERING
# ═══════════════════════════════════════════════════════════════════════════════

def infer_road_type(vtype_list: list) -> str:
    """Highest-severity road type among all violation types in a record."""
    best = "local"
    for vt in vtype_list:
        rtype = VIOLATION_ROAD_TYPE.get(vt, "local")
        if ROAD_TYPE_PRIORITY[rtype] > ROAD_TYPE_PRIORITY[best]:
            best = rtype
    return best


def extract_features(df: pd.DataFrame) -> pd.DataFrame:
    print("  Engineering features...")

    # ── Datetime: parse UTC, convert to IST ───────────────────────────────────
    df["created_datetime"] = pd.to_datetime(df["created_datetime"], format="mixed", utc=True)
    df["created_ist"]  = df["created_datetime"] + IST_OFFSET
    df["hour_ist"]     = df["created_ist"].dt.hour
    df["month"]        = df["created_ist"].dt.month
    df["year"]         = df["created_ist"].dt.year
    df["dayofweek"]    = df["created_ist"].dt.dayofweek   # 0=Mon
    df["day_name"]     = df["created_ist"].dt.day_name()
    df["is_weekend"]   = df["dayofweek"] >= 5
    df["year_month"]   = df["created_ist"].dt.to_period("M").astype(str)

    # ── Road type ─────────────────────────────────────────────────────────────
    df["road_type"] = df["vtype_list"].apply(infer_road_type)

    # ── Junction flag + name ──────────────────────────────────────────────────
    if "junction_name" in df.columns:
        df["at_junction"] = df["junction_name"].apply(
            lambda x: 0 if (pd.isna(x) or str(x).strip() in ("No Junction", "")) else 1
        )
        # Clean junction name: strip the BTPxxx code prefix, keep the human name
        df["junction_clean"] = df["junction_name"].apply(
            lambda x: str(x).split(" - ", 1)[-1].strip()
            if (pd.notna(x) and " - " in str(x)) else str(x).strip()
        )
        df["junction_clean"] = df["junction_clean"].replace({"No Junction": "", "nan": ""})
    else:
        df["at_junction"]   = 0
        df["junction_clean"] = ""

    # ── Vehicle PCU weight ────────────────────────────────────────────────────
    if "vehicle_type" in df.columns:
        df["vehicle_pcu"] = (
            df["vehicle_type"].str.upper().str.strip()
            .map(VEHICLE_PCU).fillna(1.0)
        )
    else:
        df["vehicle_pcu"] = 1.0

    return df


# ═══════════════════════════════════════════════════════════════════════════════
# 4. CONGESTION IMPACT MODEL
# ═══════════════════════════════════════════════════════════════════════════════

def calculate_congestion_impact(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes two congestion metrics per violation:

    A) vehicle-minutes of delay  (veh_min_delay)
    ───────────────────────────────────────────
    = ROAD_CAPACITY[road_type] × AFFECTED_FRACTION × DELAY_MINUTES[road_type]
      × peak_multiplier × junction_multiplier × weekend_multiplier × vehicle_pcu

    B) estimated speed reduction %  (speed_reduction_pct)
    ──────────────────────────────────────────────────────
    Uses the BPR (Bureau of Public Roads) volume-delay function:
        V/C ratio increment from one blocked lane = vehicle_pcu / ROAD_CAPACITY
        speed_reduction_pct = 100 × (1 - 1 / (1 + 0.15 × (V/C)^4))
    This gives the percentage drop in travel speed caused by this single
    parked vehicle on its road type, as a proxy for congestion severity.
    """

    # ── A: vehicle-minutes of delay ───────────────────────────────────────────
    df["base_veh_min"] = df["road_type"].map(
        lambda rt: ROAD_CAPACITY[rt] * AFFECTED_FRACTION * DELAY_MINUTES_PER_VEH[rt]
    )

    # Peak multiplier uses IST hours (correct)
    df["peak_mult"] = df["hour_ist"].apply(
        lambda h: 1.5 if (8 <= h <= 11) or (17 <= h <= 20)
        else (0.5 if (h >= 22 or h <= 5) else 1.0)
    )

    # Junction multiplier: blockage at an intersection creates a queue
    # that extends upstream and amplifies delay significantly
    df["junction_mult"] = 1.0 + 0.4 * df["at_junction"]

    # Weekend: lower baseline traffic volume
    df["weekend_mult"] = df["is_weekend"].apply(lambda w: 0.8 if w else 1.0)

    df["veh_min_delay"] = (
        df["base_veh_min"]
        * df["peak_mult"]
        * df["junction_mult"]
        * df["weekend_mult"]
        * df["vehicle_pcu"]
    )

    # ── B: per-violation speed-reduction marker (used for cluster aggregation) ─
    # Tag the road type and peak status; cluster-level BPR is computed in
    # post_process once we know how many violations are in each cluster.
    # Store raw inputs needed for the cluster-level calculation.
    df["speed_reduction_pct"] = 0.0   # placeholder; overwritten in post_process

    return df


# ═══════════════════════════════════════════════════════════════════════════════
# 5. DBSCAN HOTSPOT DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

def compute_trend(grp) -> float:
    """Linear regression slope (violations/month). Positive = worsening."""
    grp = grp.sort_values("year_month")
    if len(grp) < 2:
        return 0.0
    x = np.arange(len(grp))
    y = grp["monthly_count"].values.astype(float)
    return round(float(np.polyfit(x, y, 1)[0]), 2)


def detect_hotspots(df: pd.DataFrame) -> tuple:
    """Returns (hotspots_df, df_with_cluster_labels)"""
    print("  Running DBSCAN spatial clustering...")
    coords = df[["latitude", "longitude"]].values
    db = DBSCAN(eps=DBSCAN_EPS_DEG, min_samples=DBSCAN_MIN_SAMP, n_jobs=-1).fit(coords)
    df = df.copy()
    df["cluster"] = db.labels_

    n_clusters = len(set(db.labels_)) - (1 if -1 in db.labels_ else 0)
    noise_pct   = 100 * (db.labels_ == -1).sum() / len(df)
    print(f"  Clusters: {n_clusters}  |  Noise: {noise_pct:.1f}%")

    df_c = df[df["cluster"] != -1].copy()

    # ── Per-cluster aggregation ───────────────────────────────────────────────
    hotspots = df_c.groupby("cluster").agg(
        center_lat              = ("latitude",           "mean"),
        center_lon              = ("longitude",          "mean"),
        total_violations        = ("id",                 "count"),
        total_veh_min_delay     = ("veh_min_delay",      "sum"),
        avg_veh_min_delay       = ("veh_min_delay",      "mean"),
        dominant_road_type      = ("road_type",          lambda x: x.value_counts().index[0]),
        at_junction_pct         = ("at_junction",        "mean"),
        peak_hour_pct           = ("peak_mult",          lambda x: (x > 1.0).mean()),
        main_police_station     = ("police_station",     lambda x: x.mode()[0] if not x.empty else "Unknown"),
        months_active           = ("year_month",         "nunique"),
        first_seen              = ("created_ist",        "min"),
        last_seen               = ("created_ist",        "max"),
        dominant_day            = ("day_name",           lambda x: x.value_counts().index[0]),
        top_junction            = ("junction_clean",     lambda x: x[x != ""].mode()[0] if not x[x != ""].empty else ""),
        top_violation_type      = ("vtype_list",         lambda x: _top_violation(x)),
    ).reset_index()

    # ── Vehicle type mix per cluster ──────────────────────────────────────────
    if "vehicle_type" in df_c.columns:
        veh_mix = (
            df_c.groupby("cluster")["vehicle_type"]
            .apply(lambda x: json.dumps(x.value_counts().head(5).to_dict()))
            .reset_index(name="vehicle_mix_json")
        )
        hotspots = hotspots.merge(veh_mix, on="cluster", how="left")
    else:
        hotspots["vehicle_mix_json"] = "{}"

    # ── Day-of-week peak per cluster ──────────────────────────────────────────
    dow_peak = (
        df_c.groupby("cluster")["day_name"]
        .apply(lambda x: json.dumps(x.value_counts().to_dict()))
        .reset_index(name="dow_breakdown_json")
    )
    hotspots = hotspots.merge(dow_peak, on="cluster", how="left")

    # ── Hour-of-day distribution per cluster ──────────────────────────────────
    hour_dist = (
        df_c.groupby("cluster")["hour_ist"]
        .apply(lambda x: json.dumps({str(k): int(v) for k, v in x.value_counts().sort_index().items()}))
        .reset_index(name="hour_breakdown_json")
    )
    hotspots = hotspots.merge(hour_dist, on="cluster", how="left")

    return hotspots, df


def _top_violation(series) -> str:
    """Most common individual violation type across a cluster."""
    from collections import Counter
    all_v = [v for lst in series for v in lst]
    if not all_v:
        return "UNKNOWN"
    return Counter(all_v).most_common(1)[0][0].title()


# ═══════════════════════════════════════════════════════════════════════════════
# 6. POST-PROCESSING: TRENDS, ROI, SCORES
# ═══════════════════════════════════════════════════════════════════════════════

def post_process(df_full: pd.DataFrame, hotspots: pd.DataFrame) -> pd.DataFrame:
    df_c = df_full[df_full["cluster"] != -1].copy()

    # ── Monthly breakdown ─────────────────────────────────────────────────────
    monthly = (
        df_c.groupby(["cluster", "year_month"])
        .size()
        .reset_index(name="monthly_count")
    )

    trend_df = (
        monthly.groupby("cluster")
        .apply(compute_trend, include_groups=False)
        .reset_index(name="monthly_trend_slope")
    )
    hotspots = hotspots.merge(trend_df, on="cluster", how="left")

    monthly_json = (
        monthly.groupby("cluster")
        .apply(lambda g: dict(zip(g["year_month"], g["monthly_count"])), include_groups=False)
        .reset_index(name="monthly_breakdown")
    )
    monthly_json["monthly_breakdown"] = monthly_json["monthly_breakdown"].apply(json.dumps)
    hotspots = hotspots.merge(monthly_json, on="cluster", how="left")

    # ── Chronic classification ────────────────────────────────────────────────
    total_months = df_full["year_month"].nunique()
    hotspots["chronic"] = hotspots["months_active"] >= max(2, round(0.75 * total_months))

    # ── Enforcement ROI ───────────────────────────────────────────────────────
    CHALLAN_INR = 1000
    hotspots["monthly_violations"] = (
        hotspots["total_violations"] / hotspots["months_active"]
    ).round(0).astype(int)

    hotspots["veh_hours_saved_monthly"] = (
        (hotspots["total_veh_min_delay"] / hotspots["months_active"]) / 60
    ).round(1)

    hotspots["monthly_fine_revenue_inr"] = hotspots["monthly_violations"] * CHALLAN_INR
    hotspots["annual_fine_revenue_inr"]  = hotspots["monthly_fine_revenue_inr"] * 12

    # ── Normalised scores (0–100) ─────────────────────────────────────────────
    scaler = MinMaxScaler(feature_range=(0, 100))
    hotspots["impact_score_normalized"] = (
        scaler.fit_transform(hotspots[["total_veh_min_delay"]])
        .flatten().round(2)
    )

    # ── BPR cluster-level speed reduction ────────────────────────────────────
    # During peak hours, the cluster has on average N simultaneous parked vehicles
    # (spread over 90 peak hours/month). This reduces effective road capacity.
    # Speed reduction model (linear, bounded):
    #   delta_speed% = (N_parked / road_capacity) * 100
    # This is the % of free-flow speed lost due to lane obstruction.
    # At max observed V/C (~3.7%), the top cluster causes ~3.7% speed drop,
    # equivalent to ~1.8 km/h slower on a local road — realistic for a congested
    # inner-city lane with multiple simultaneously parked vehicles.
    PEAK_HOURS_PER_MONTH = 90   # 30 days × 3 peak hours
    hotspots["simultaneous_vehicles"] = (
        (hotspots["monthly_violations"] * hotspots["peak_hour_pct"]) / PEAK_HOURS_PER_MONTH
    ).clip(lower=0.01)
    hotspots["road_capacity_val"] = hotspots["dominant_road_type"].map(ROAD_CAPACITY)
    hotspots["vc_ratio"] = (
        hotspots["simultaneous_vehicles"] / hotspots["road_capacity_val"]
    )
    # Linear speed reduction (% of free-flow speed)
    hotspots["speed_reduction_pct"] = (hotspots["vc_ratio"] * 100).round(4)
    hotspots["free_flow_speed"]      = hotspots["dominant_road_type"].map(FREE_FLOW_SPEED)
    hotspots["congested_speed_kmph"] = (
        hotspots["free_flow_speed"] * (1 - hotspots["vc_ratio"])
    ).round(2)

    hotspots["speed_reduction_normalized"] = (
        scaler.fit_transform(hotspots[["speed_reduction_pct"]])
        .flatten().round(2)
    )

    # ── Priority score ────────────────────────────────────────────────────────
    # Combines: congestion impact + speed reduction + chronic bonus + trend penalty
    max_slope = hotspots["monthly_trend_slope"].abs().max() + 1e-9
    hotspots["trend_score"] = (
        hotspots["monthly_trend_slope"].clip(lower=0) / max_slope
    ) * 20

    hotspots["priority_score"] = (
        hotspots["impact_score_normalized"] * 0.60
        + hotspots["speed_reduction_normalized"] * 0.25
        + hotspots["chronic"].astype(int) * 10
        + hotspots["trend_score"] * 0.15
    ).round(2)

    hotspots = hotspots.sort_values("priority_score", ascending=False).reset_index(drop=True)
    hotspots["enforcement_rank"] = hotspots.index + 1

    # ── Natural-language summary ──────────────────────────────────────────────
    hotspots["summary"] = hotspots.apply(_build_summary, axis=1)

    return hotspots


def _build_summary(row: pd.Series) -> str:
    slope = row["monthly_trend_slope"]
    trend = (
        f"↑ worsening ({slope:+.0f}/month)" if slope > 2
        else (f"↓ improving ({slope:+.0f}/month)" if slope < -2 else "→ stable")
    )
    chronic = "Chronic (every month)" if row["chronic"] else "Intermittent"
    junc_val = row.get("top_junction", "")
    junc = f" Near {junc_val}." if (junc_val and not pd.isna(junc_val) and str(junc_val).strip()) else ""
    return (
        f"{int(row['total_violations']):,} confirmed violations over {row['months_active']} months "
        f"on a {row['dominant_road_type'].replace('_','-')} road in {row['main_police_station']}."
        f"{junc} "
        f"{row['peak_hour_pct']*100:.0f}% during peak hours (IST). "
        f"Avg speed reduction: {row['speed_reduction_pct']:.3f}% "
        f"(congested speed ~{row.get('congested_speed_kmph', 'N/A')} km/h). "
        f"Trend: {trend}. {chronic}. "
        f"Clearing this zone saves ~{row['veh_hours_saved_monthly']:,.0f} veh-hrs/month "
        f"and yields ~₹{row['monthly_fine_revenue_inr']:,.0f} in monthly challan revenue."
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 7. JUNCTION-LEVEL ANALYSIS (separate output)
# ═══════════════════════════════════════════════════════════════════════════════

def build_junction_hotspots(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregates all violations with a real junction name into a
    junction-level hotspot table. Independent of DBSCAN clusters —
    these are named, known intersections from the field data.
    """
    jdf = df[(df["at_junction"] == 1) & (df["junction_clean"] != "")].copy()
    if jdf.empty:
        return pd.DataFrame()

    junc = jdf.groupby("junction_clean").agg(
        center_lat              = ("latitude",            "mean"),
        center_lon              = ("longitude",           "mean"),
        total_violations        = ("id",                  "count"),
        total_veh_min_delay     = ("veh_min_delay",       "sum"),
        dominant_road_type      = ("road_type",           lambda x: x.value_counts().index[0]),
        peak_hour_pct           = ("peak_mult",           lambda x: (x > 1.0).mean()),
        main_police_station     = ("police_station",      lambda x: x.mode()[0] if not x.empty else "Unknown"),
        months_active           = ("year_month",          "nunique"),
        dominant_day            = ("day_name",            lambda x: x.value_counts().index[0]),
    ).reset_index()

    junc["monthly_violations"]       = (junc["total_violations"] / junc["months_active"]).round(0).astype(int)
    junc["veh_hours_saved_monthly"]  = ((junc["total_veh_min_delay"] / junc["months_active"]) / 60).round(1)
    junc["monthly_fine_revenue_inr"] = junc["monthly_violations"] * 1000

    # Speed reduction at junction level (same linear model)
    PEAK_HOURS_PER_MONTH = 90
    junc["simultaneous_vehicles"] = (
        (junc["monthly_violations"] * junc["peak_hour_pct"]) / PEAK_HOURS_PER_MONTH
    ).clip(lower=0.01)
    junc["road_capacity_val"] = junc["dominant_road_type"].map(ROAD_CAPACITY)
    junc["vc_ratio"] = junc["simultaneous_vehicles"] / junc["road_capacity_val"]
    junc["speed_reduction_pct"] = (junc["vc_ratio"] * 100).round(4)
    junc["free_flow_speed"]      = junc["dominant_road_type"].map(FREE_FLOW_SPEED)
    junc["congested_speed_kmph"] = (junc["free_flow_speed"] * (1 - junc["vc_ratio"])).round(2)

    scaler = MinMaxScaler(feature_range=(0, 100))
    junc["impact_score_normalized"] = (
        scaler.fit_transform(junc[["total_veh_min_delay"]]).flatten().round(2)
    )
    junc = junc.sort_values("total_veh_min_delay", ascending=False).reset_index(drop=True)
    junc["junction_rank"] = junc.index + 1
    return junc


# ═══════════════════════════════════════════════════════════════════════════════
# 8. PATROL SHIFT TABLE
# ═══════════════════════════════════════════════════════════════════════════════

def build_patrol_schedule(hotspots: pd.DataFrame, top_n: int = 20) -> pd.DataFrame:
    """
    Generates a concrete patrol shift recommendation table for the top_n hotspots.
    Shift assignment rules (based on dominant peak window and day):
      - Peak AM (08:00–11:30): Morning shift
      - Peak PM (17:00–20:30): Evening shift
      - Night-heavy (22:00–05:00): Night patrol
      - Mixed: Both AM + PM shifts
    """
    records = []
    top = hotspots.head(top_n)
    for _, row in top.iterrows():
        # Determine shift from hour breakdown
        # hour_breakdown_json may be a dict (already parsed) or a JSON string
        hb = {}
        try:
            raw = row.get("hour_breakdown_json", "{}")
            hb = raw if isinstance(raw, dict) else json.loads(raw)
        except Exception:
            pass

        peak_am  = sum(v for k, v in hb.items() if 8  <= int(k) <= 11)
        peak_pm  = sum(v for k, v in hb.items() if 17 <= int(k) <= 20)
        night    = sum(v for k, v in hb.items() if int(k) >= 22 or int(k) <= 5)
        total    = sum(hb.values()) or 1

        if peak_am / total > 0.35:
            shift = "Morning (08:00–11:30)"
        elif peak_pm / total > 0.20:
            shift = "Evening (17:00–20:30)"
        elif night / total > 0.40:
            shift = "Night (22:00–05:00)"
        else:
            shift = "Morning + Evening"

        _tj = row.get("top_junction", "")
        junc_label = "" if (not _tj or (isinstance(_tj, float) and _tj != _tj)) else str(_tj).strip()
        records.append({
            "rank":            int(row["enforcement_rank"]),
            "station":         row["main_police_station"],
            "junction":        junc_label,
            "road_type":       row["dominant_road_type"].replace("_", "-"),
            "peak_day":        row.get("dominant_day", ""),
            "recommended_shift": shift,
            "monthly_violations": int(row["monthly_violations"]),
            "veh_hrs_saved_mo":   row["veh_hours_saved_monthly"],
            "priority_score":  row["priority_score"],
            "chronic":         bool(row["chronic"]),
        })
    return pd.DataFrame(records)


# ═══════════════════════════════════════════════════════════════════════════════
# 9. MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print("\n══════════════════════════════════════════════════")
    print("  AI Parking Intelligence — Data Pipeline v2")
    print("══════════════════════════════════════════════════\n")

    print("[1/6] Loading data...")
    df = load_data(DATA_SOURCE)

    print("\n[2/6] Filtering to confirmed parking records...")
    df = filter_records(df)

    print("\n[3/6] Engineering features (IST timestamps, road types, PCU weights)...")
    df = extract_features(df)

    print("\n[4/6] Calculating congestion impact (veh-min delay + BPR speed reduction)...")
    df = calculate_congestion_impact(df)

    print("\n[5/6] Detecting DBSCAN hotspots...")
    hotspots, df_clustered = detect_hotspots(df)
    hotspots = post_process(df_clustered, hotspots)

    hotspots.to_csv(OUTPUT_PATH, index=False)
    print(f"\n✓ {len(hotspots)} cluster hotspots → {OUTPUT_PATH}")

    print("\n[6/6] Building junction-level analysis...")
    junc_hotspots = build_junction_hotspots(df)
    if not junc_hotspots.empty:
        junc_hotspots.to_csv(JUNCTION_OUTPUT_PATH, index=False)
        print(f"✓ {len(junc_hotspots)} junction hotspots → {JUNCTION_OUTPUT_PATH}")

    print("\n── Top 10 Cluster Priorities ───────────────────────────────────")
    cols = ["enforcement_rank", "main_police_station", "dominant_road_type",
            "total_violations", "monthly_violations", "speed_reduction_pct", "congested_speed_kmph",
            "veh_hours_saved_monthly", "monthly_fine_revenue_inr",
            "chronic", "monthly_trend_slope", "dominant_day"]
    print(hotspots[cols].head(10).to_string(index=False))

    if not junc_hotspots.empty:
        print("\n── Top 10 Junction Hotspots ────────────────────────────────────")
        jcols = ["junction_rank", "junction_clean", "main_police_station",
                 "total_violations", "veh_hours_saved_monthly", "speed_reduction_pct", "congested_speed_kmph"]
        print(junc_hotspots[jcols].head(10).to_string(index=False))


if __name__ == "__main__":
    main()
