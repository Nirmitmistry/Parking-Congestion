import React, { useState } from 'react';

export const ROISimulator = ({ data }) => {
  const [selectedHotspots, setSelectedHotspots] = useState([]);

  if (!data || data.length === 0) return null;

  const top30 = data.slice(0, 30);
  
  const handleSelect = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions).map(option => option.value);
    setSelectedHotspots(selectedOptions);
  };

  const selectedData = data.filter(d => selectedHotspots.includes(d.enforcement_rank?.toString() || ''));

  const totalViolations = selectedData.reduce((sum, d) => sum + (d.monthly_violations || 0), 0);
  const totalVehHrs = selectedData.reduce((sum, d) => sum + (d.veh_hours_saved_monthly || 0), 0);
  const totalRevenue = selectedData.reduce((sum, d) => sum + (d.monthly_fine_revenue_inr || 0), 0);
  const annualRevenue = selectedData.reduce((sum, d) => sum + (d.annual_fine_revenue_inr || 0), 0);
  const maxSpeedLoss = selectedData.length > 0 ? Math.max(...selectedData.map(d => d.speed_reduction_pct || 0)) : 0;

  return (
    <div className="card">
      <div className="card-header">⚡ Enforcement ROI Simulator</div>
      <p style={{ marginBottom: '16px' }}>Select hotspots to see the combined impact of clearing them.</p>
      
      <div style={{ marginBottom: '24px' }}>
        <label>Choose hotspots to clear:</label>
        <select 
          multiple 
          value={selectedHotspots} 
          onChange={handleSelect}
          className="select-input"
          style={{ height: '120px' }}
        >
          {top30.map((h, i) => (
            <option key={i} value={h.enforcement_rank?.toString()}>
              #{h.enforcement_rank} — {h.main_police_station} ({(h.dominant_road_type || '').replace(/_/g, ' ')}) | {Math.round(h.total_violations).toLocaleString()} violations
            </option>
          ))}
        </select>
      </div>

      {selectedHotspots.length > 0 && (
        <div className="metric-grid">
          <div className="metric-card" style={{ borderTopColor: '#10B981' }}>
            <div className="label">Monthly Violations Cleared</div>
            <div className="value">{Math.round(totalViolations).toLocaleString()}</div>
          </div>
          <div className="metric-card" style={{ borderTopColor: '#3B82F6' }}>
            <div className="label">Vehicle-Hours Saved/Mo</div>
            <div className="value">{Math.round(totalVehHrs).toLocaleString()}</div>
          </div>
          <div className="metric-card" style={{ borderTopColor: '#F59E0B' }}>
            <div className="label">Monthly Fine Revenue</div>
            <div className="value">₹{Math.round(totalRevenue).toLocaleString()}</div>
          </div>
          <div className="metric-card" style={{ borderTopColor: '#EF4444' }}>
            <div className="label">Annual Revenue Projection</div>
            <div className="value">₹{Math.round(annualRevenue).toLocaleString()}</div>
          </div>
          <div className="metric-card" style={{ borderTopColor: '#8B5CF6' }}>
            <div className="label">Max Speed Loss Addressed</div>
            <div className="value">{maxSpeedLoss.toFixed(3)}%</div>
          </div>
        </div>
      )}
    </div>
  );
};
