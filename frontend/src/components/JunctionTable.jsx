import React from 'react';

export const JunctionTable = ({ data }) => {
  if (!data || data.length === 0) return null;

  const topJunctions = data.slice(0, 25);

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div className="card-header">🔀 Named Junction Hotspots</div>
      <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
        50.4% of violations occurred at named, signalised junctions. These are the specific intersections causing the most congestion.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Junction Name</th>
            <th>Station</th>
            <th>Road Type</th>
            <th>Violations/Mo</th>
            <th>Speed Loss %</th>
            <th>Speed (km/h)</th>
            <th>Veh-Hrs/Mo</th>
            <th>Rev/Mo (₹)</th>
            <th>Peak Day</th>
          </tr>
        </thead>
        <tbody>
          {topJunctions.map((row, idx) => {
            const rank = row.junction_rank || (idx + 1);
            return (
              <tr key={idx}>
                <td><b>#{rank}</b></td>
                <td><b>{row.junction_clean}</b></td>
                <td>{row.main_police_station}</td>
                <td>{(row.dominant_road_type || '').replace(/_/g, ' ')}</td>
                <td>{Math.round(row.monthly_violations || 0).toLocaleString()}</td>
                <td>{Number(row.speed_reduction_pct || 0).toFixed(3)}%</td>
                <td>{Number(row.congested_speed_kmph || 0).toFixed(1)}</td>
                <td>{Math.round(row.veh_hours_saved_monthly || 0).toLocaleString()}</td>
                <td>₹{Math.round(row.monthly_fine_revenue_inr || 0).toLocaleString()}</td>
                <td>{row.dominant_day}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
