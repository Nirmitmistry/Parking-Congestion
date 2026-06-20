import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

export const Charts = ({ data }) => {
  if (!data || data.length === 0) return null;

  // Monthly Trends Chart
  const top6 = data.slice(0, 6);
  const months = ["2023-11", "2023-12", "2024-01", "2024-02", "2024-03", "2024-04", "2024-05"];
  const monthLabels = {
    "2023-11": "Nov '23", "2023-12": "Dec '23",
    "2024-01": "Jan '24", "2024-02": "Feb '24",
    "2024-03": "Mar '24", "2024-04": "Apr '24", "2024-05": "May '24"
  };

  const trendData = months.map(m => {
    const row = { name: monthLabels[m] };
    top6.forEach((hotspot, idx) => {
      const mb = hotspot.monthly_breakdown || {};
      row[`Zone ${idx + 1}`] = mb[m] || 0;
    });
    return row;
  });

  // Jurisdiction Impact (top 12 stations by veh-hrs saved)
  const stationMap = {};
  data.forEach(d => {
    if (!d.main_police_station) return;
    stationMap[d.main_police_station] = (stationMap[d.main_police_station] || 0) + (d.veh_hours_saved_monthly || 0);
  });
  const jurisdictionData = Object.keys(stationMap)
    .map(k => ({ name: k, value: Math.round(stationMap[k]) }))
    .sort((a,b) => b.value - a.value)
    .slice(0, 12);

  // Violations by road type
  const roadTypeMap = {};
  data.forEach(d => {
    if (!d.dominant_road_type) return;
    const rt = d.dominant_road_type.replace(/_/g, ' ');
    roadTypeMap[rt] = (roadTypeMap[rt] || 0) + (d.total_violations || 0);
  });
  const roadTypeData = Object.keys(roadTypeMap)
    .map(k => ({ name: k, value: roadTypeMap[k] }))
    .sort((a,b) => b.value - a.value);

  // Colors for lines
  const colors = ["#2563EB", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#EC4899"];

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div className="card">
          <div className="card-header">Monthly Violation Trends</div>
          <p style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>(Normalised per zone to 0-100 so small zones are visible)</p>
          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D4CFC7" vertical={false} />
                <XAxis dataKey="name" tick={{fill: '#718096', fontSize: 12}} />
                <YAxis tick={{fill: '#718096', fontSize: 12}} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--neu-flat)', backgroundColor: 'var(--bg-base)' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {top6.map((h, i) => (
                  <Line 
                    key={i} 
                    type="monotone" 
                    dataKey={`Zone ${i + 1}`} 
                    name={`#${h.enforcement_rank} ${h.main_police_station}`}
                    stroke={colors[i]} 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Vehicle Mix (Top Cluster)</div>
          <div style={{ height: '320px', width: '100%' }}>
            {top6[0]?.vehicle_mix_json ? (() => {
              const vm = top6[0].vehicle_mix_json;
              const vmData = Object.keys(vm).map(k => ({ name: k, value: vm[k] })).sort((a,b) => b.value - a.value);
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={vmData} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#D4CFC7" vertical={false} />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" tick={{fill: '#718096', fontSize: 11}} height={60} />
                    <YAxis tick={{fill: '#718096', fontSize: 12}} />
                    <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--neu-flat)', backgroundColor: 'var(--bg-base)' }} />
                    <Bar dataKey="value" name="Violations" fill="#12515C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              );
            })() : <p>No vehicle mix data</p>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div className="card">
          <div className="card-header">Jurisdiction Impact (Veh-Hrs Saved/Mo)</div>
          <div style={{ height: '240px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jurisdictionData} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D4CFC7" vertical={false} />
                <XAxis dataKey="name" angle={-45} textAnchor="end" tick={{fill: '#718096', fontSize: 10}} height={70} />
                <YAxis tick={{fill: '#718096', fontSize: 11}} />
                <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--neu-flat)', backgroundColor: 'var(--bg-base)' }} />
                <Bar dataKey="value" name="Veh-Hrs/Mo" fill="#0F3A44" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Violations by Road Type</div>
          <div style={{ height: '240px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roadTypeData} margin={{ top: 5, right: 20, bottom: 25, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D4CFC7" vertical={false} />
                <XAxis dataKey="name" angle={-45} textAnchor="end" tick={{fill: '#718096', fontSize: 11}} height={60} />
                <YAxis tick={{fill: '#718096', fontSize: 11}} />
                <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--neu-flat)', backgroundColor: 'var(--bg-base)' }} />
                <Bar dataKey="value" name="Violations" fill="#0F3A44" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
};
