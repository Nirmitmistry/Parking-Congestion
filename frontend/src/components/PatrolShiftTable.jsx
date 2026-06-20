import React from 'react';

export const PatrolShiftTable = ({ data }) => {
  if (!data || data.length === 0) return null;

  const topHotspots = data.slice(0, 25);

  const getRecommendedShift = (hb) => {
    if (!hb) return "Morning + Evening";
    const peakAm = [8,9,10,11].reduce((sum, h) => sum + (hb[h] || 0), 0);
    const peakPm = [17,18,19,20].reduce((sum, h) => sum + (hb[h] || 0), 0);
    
    // Night is 22 to 5. So 22, 23, 0, 1, 2, 3, 4, 5
    const nightHours = [22, 23, 0, 1, 2, 3, 4, 5];
    const night = nightHours.reduce((sum, h) => sum + (hb[h] || 0), 0);
    
    const total = Object.values(hb).reduce((sum, v) => sum + v, 0) || 1;

    if (peakAm / total > 0.35) return "Morning (08:00–11:30)";
    if (peakPm / total > 0.20) return "Evening (17:00–20:30)";
    if (night / total > 0.40) return "Night (22:00–05:00)";
    return "Morning + Evening";
  };

  const getShiftStyle = (shift) => {
    if (shift.includes('Morning') && shift.includes('Evening')) return { backgroundColor: 'rgba(217, 119, 6, 0.1)' }; // Amber mix
    if (shift.includes('Morning')) return { backgroundColor: 'rgba(5, 150, 105, 0.1)' }; // Emerald morning
    if (shift.includes('Evening')) return { backgroundColor: 'rgba(37, 99, 235, 0.1)' }; // Blue evening
    if (shift.includes('Night')) return { backgroundColor: 'rgba(76, 29, 149, 0.1)' }; // Purple night
    return {};
  };

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div className="card-header">📅 Patrol Shift Recommendation Table</div>
      <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
        Shift assignment is derived directly from the hour-of-day distribution (IST) of each cluster. 
        The dominant peak window determines the optimal patrol slot.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Station</th>
            <th>Near Junction</th>
            <th>Road Type</th>
            <th>Busiest Day</th>
            <th>Recommended Shift</th>
            <th>Viol/Mo</th>
            <th>Veh-Hrs Saved</th>
            <th>Chronic</th>
          </tr>
        </thead>
        <tbody>
          {topHotspots.map((row, idx) => {
            const shift = getRecommendedShift(row.hour_breakdown_json);
            return (
              <tr key={idx} style={getShiftStyle(shift)}>
                <td><b>#{row.enforcement_rank}</b></td>
                <td>{row.main_police_station}</td>
                <td>{row.top_junction || row.junction_clean || ''}</td>
                <td>{(row.dominant_road_type || '').replace(/_/g, ' ')}</td>
                <td>{row.dominant_day}</td>
                <td><b>{shift}</b></td>
                <td>{Math.round(row.monthly_violations || 0).toLocaleString()}</td>
                <td>{Math.round(row.veh_hours_saved_monthly || 0).toLocaleString()}</td>
                <td>{row.chronic ? "✅" : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
