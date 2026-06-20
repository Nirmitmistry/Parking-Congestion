import React from 'react';

const MetricCard = ({ label, value, delta }) => (
  <div className="metric-card marquee-item">
    <div className="label">{label}</div>
    <div className="value">{value}</div>
    <div className="delta">{delta}</div>
  </div>
);

export const KPIRow = ({ data }) => {
  if (!data || data.length === 0) return null;

  const n_chronic = data.filter(d => d.chronic).length;
  const total_veh_hrs = data.reduce((sum, d) => sum + (d.veh_hours_saved_monthly || 0), 0);
  const total_revenue = data.reduce((sum, d) => sum + (d.monthly_fine_revenue_inr || 0), 0);
  const max_speed_red = Math.max(...data.map(d => d.speed_reduction_pct || 0));
  const total_violations = data.reduce((sum, d) => sum + (d.total_violations || 0), 0);

  const cardsData = [
    { label: "Hotspots", value: data.length.toLocaleString(), delta: "Filtered" },
    { label: "Confirmed Violations", value: total_violations.toLocaleString(), delta: "Approved records only" },
    { label: "Chronic Zones", value: n_chronic, delta: "Active every month" },
    { label: "Veh-Hrs Saved/Mo", value: `${Math.round(total_veh_hrs).toLocaleString()} hrs`, delta: "If all zones cleared" },
    { label: "Monthly Fine Revenue", value: `₹${Math.round(total_revenue).toLocaleString()}`, delta: "Estimated" },
    { label: "Worst Speed Loss", value: `${max_speed_red.toFixed(2)}%`, delta: "Top cluster (linear V/C model)" }
  ];

  return (
    <div className="marquee-container">
      <div className="marquee-content">
        {cardsData.map((card, i) => <MetricCard key={`1-${i}`} {...card} />)}
        {cardsData.map((card, i) => <MetricCard key={`2-${i}`} {...card} />)}
      </div>
    </div>
  );
};
