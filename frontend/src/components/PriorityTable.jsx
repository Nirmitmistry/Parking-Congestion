import React from 'react';

export const PriorityTable = ({ data }) => {
  if (!data || data.length === 0) return null;

  const topHotspots = data.slice(0, 20);

  return (
    <div 
      className="card" 
      style={{ 
        backgroundColor: 'var(--bg-sidebar)', /* Dark Blue */
        color: '#FFFFFF',
        display: 'flex', 
        flexDirection: 'column',
        height: '720px',
        padding: '24px'
      }}
    >
      <div className="card-header" style={{ marginBottom: '16px', fontSize: '1rem', color: '#FFFFFF', borderBottomColor: 'rgba(255,255,255,0.3)' }}>
        Top Enforcement Priorities
      </div>
      
      <div style={{ overflowY: 'auto', overflowX: 'auto', flex: 1, borderRadius: '8px', boxShadow: 'inset 2px 2px 6px rgba(0,0,0,0.2)' }}>
        <table className="data-table" style={{ fontSize: '0.75rem', backgroundColor: 'transparent', boxShadow: 'none', color: '#FFFFFF' }}>
          <thead>
            <tr>
              <th style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: '#D1FAE5' }}>Rank</th>
              <th style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: '#D1FAE5' }}>Station</th>
              <th style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: '#D1FAE5' }}>Road Type</th>
              <th style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: '#D1FAE5' }}>Viol/Mo</th>
              <th style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: '#D1FAE5' }}>Speed Loss %</th>
              <th style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: '#D1FAE5' }}>Speed (km/h)</th>
              <th style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: '#D1FAE5' }}>Veh-Hrs/Mo</th>
              <th style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: '#D1FAE5' }}>Rev/Mo (₹)</th>
              <th style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: '#D1FAE5' }}>Chronic</th>
            </tr>
          </thead>
          <tbody>
            {topHotspots.map((row, idx) => {
              const rank = row.enforcement_rank || (idx + 1);
              return (
                <tr key={idx} style={{ backgroundColor: 'transparent' }}>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}><b>#{rank}</b></td>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{row.main_police_station}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{(row.dominant_road_type || '').replace(/_/g, ' ')}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{Math.round(row.monthly_violations || 0).toLocaleString()}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{Number(row.speed_reduction_pct || 0).toFixed(2)}%</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{Number(row.congested_speed_kmph || 0).toFixed(1)}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{Math.round(row.veh_hours_saved_monthly || 0).toLocaleString()}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>₹{Math.round(row.monthly_fine_revenue_inr || 0).toLocaleString()}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{row.chronic ? "✅" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
