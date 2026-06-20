import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const HourOfDayChart = ({ data }) => {
  const [selectedHotspot, setSelectedHotspot] = useState('');

  if (!data || data.length === 0) return null;

  const top20 = data.slice(0, 20);
  const activeHotspot = selectedHotspot ? data.find(d => d.enforcement_rank?.toString() === selectedHotspot) : top20[0];

  if (!activeHotspot || !activeHotspot.hour_breakdown_json) return null;

  const hb = activeHotspot.hour_breakdown_json;
  
  // Format into 24 hours
  const hourData = Array.from({ length: 24 }, (_, i) => {
    return {
      hour: `${i.toString().padStart(2, '0')}:00`,
      violations: hb[i] || 0
    };
  });

  const totalViolations = Object.values(hb).reduce((sum, v) => sum + v, 0) || 1;
  const amPeak = [8, 9, 10, 11].reduce((sum, h) => sum + (hb[h] || 0), 0);
  const pmPeak = [17, 18, 19, 20].reduce((sum, h) => sum + (hb[h] || 0), 0);
  
  const amPct = ((amPeak / totalViolations) * 100).toFixed(0);
  const pmPct = ((pmPeak / totalViolations) * 100).toFixed(0);

  return (
    <div className="card">
      <div className="card-header">🕐 Hour-of-Day Violation Profile (IST)</div>
      <p style={{ marginBottom: '16px' }}>Select a hotspot to see its 24-hour violation distribution</p>
      
      <div style={{ marginBottom: '24px' }}>
        <select 
          className="select-input"
          value={selectedHotspot || activeHotspot.enforcement_rank?.toString()} 
          onChange={(e) => setSelectedHotspot(e.target.value)}
        >
          {top20.map((h, i) => (
            <option key={i} value={h.enforcement_rank?.toString()}>
              #{h.enforcement_rank} — {h.main_police_station} ({(h.dominant_road_type || '').replace(/_/g, ' ')})
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '24px' }}>
        <div style={{ height: '240px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D4CFC7" vertical={false} />
              <XAxis dataKey="hour" tick={{fill: '#718096', fontSize: 11}} interval={2} />
              <YAxis tick={{fill: '#718096', fontSize: 11}} />
              <Tooltip 
                cursor={{fill: 'rgba(0,0,0,0.05)'}} 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--neu-flat)', backgroundColor: 'var(--bg-base)' }} 
              />
              <Bar dataKey="violations" fill="#12515C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center' }}>
          <div>
            <strong>Peak windows (IST)</strong><br/>
            <span style={{color: '#F97316'}}>●</span> AM Peak: 08:00–11:59<br/>
            <span style={{color: '#F97316'}}>●</span> PM Peak: 17:00–20:59
          </div>
          <div className="metric-card" style={{ padding: '12px', borderRadius: '12px' }}>
            <div className="label">AM Peak share</div>
            <div className="value" style={{ fontSize: '1.5rem' }}>{amPct}%</div>
          </div>
          <div className="metric-card" style={{ padding: '12px', borderRadius: '12px' }}>
            <div className="label">PM Peak share</div>
            <div className="value" style={{ fontSize: '1.5rem' }}>{pmPct}%</div>
          </div>
        </div>
      </div>
    </div>
  );
};
