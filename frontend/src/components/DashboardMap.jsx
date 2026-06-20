import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Maximize, Minimize } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const BANGALORE_CENTER = [12.9716, 77.5946];

// Helper to fix the grey space bug in Leaflet when container resizes
const MapResizer = ({ isFullscreen }) => {
  const map = useMap();
  useEffect(() => {
    // Delay slightly to ensure CSS layout is fully settled before invalidating size
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timeout);
  }, [map, isFullscreen]);
  return null;
};

export const DashboardMap = ({ data, junctionData }) => {
  const [activeTab, setActiveTab] = useState('hotspots');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const renderMarkers = (plotData) => {
    return plotData.map((row, idx) => {
      if (!row.center_lat || !row.center_lon) return null;
      
      const score = row.impact_score_normalized || 0;
      let color = "#3B82F6"; // Blue ZONE
      let zone = "🔵 BLUE ZONE";
      
      if (score > 60) {
        color = "#EF4444"; // Red ZONE
        zone = "🔴 RED ZONE";
      } else if (score > 25) {
        color = "#F97316"; // Orange ZONE
        zone = "🟠 ORANGE ZONE";
      }

      const radius = Math.max(6, Math.min(Math.floor(score / 4) + 6, 28));
      const rankLabel = row.enforcement_rank || row.junction_rank || "";
      const juncName = row.junction_clean || row.top_junction || "";

      return (
        <CircleMarker
          key={idx}
          center={[row.center_lat, row.center_lon]}
          radius={radius}
          pathOptions={{ color, fillColor: color, fillOpacity: 0.65, weight: 1.5 }}
        >
          <Popup>
            <div style={{ fontFamily: 'sans-serif', minWidth: '250px' }}>
              <h4 style={{ margin: '0 0 8px', color }}>{zone}</h4>
              <b>Rank #{rankLabel}</b> — {row.main_police_station}<br/>
              <hr style={{ borderColor: '#D6D3CD', margin: '5px 0' }}/>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <tbody>
                  <tr><td>Road type</td><td><b>{(row.dominant_road_type || '').replace(/_/g, ' ').toUpperCase()}</b></td></tr>
                  {juncName && <tr><td>Junction</td><td><b>{juncName}</b></td></tr>}
                  <tr><td>Total violations</td><td><b>{Math.round(row.total_violations).toLocaleString()}</b></td></tr>
                  <tr><td>Speed reduction</td><td><b>{Number(row.speed_reduction_pct || 0).toFixed(3)}%</b></td></tr>
                  <tr><td>Veh-hrs saved/mo</td><td><b>{Math.round(row.veh_hours_saved_monthly || 0).toLocaleString()}</b></td></tr>
                  <tr><td>Fine rev/mo</td><td><b>₹{Math.round(row.monthly_fine_revenue_inr || 0).toLocaleString()}</b></td></tr>
                  <tr><td>Chronic</td><td><b>{row.chronic ? "✅ Yes" : "No"}</b></td></tr>
                </tbody>
              </table>
            </div>
          </Popup>
        </CircleMarker>
      );
    });
  };

  const mapBoxStyle = isFullscreen 
    ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99999, backgroundColor: 'var(--bg-base)' }
    : { flex: 1, width: '100%', borderRadius: '16px', overflow: 'hidden', position: 'relative', boxShadow: 'var(--neu-inset)' };

  return (
    <div className={isFullscreen ? "" : "card"} style={isFullscreen ? mapBoxStyle : { minWidth: 0, height: '720px', display: 'flex', flexDirection: 'column' }}>
      {!isFullscreen && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div className="card-header" style={{ marginBottom: 0 }}>High-Impact Zones Map</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className={`button-primary ${activeTab === 'hotspots' ? '' : 'inactive'}`} 
              style={{ backgroundColor: activeTab === 'hotspots' ? 'var(--primary-btn)' : 'rgba(0,0,0,0.05)', color: activeTab === 'hotspots' ? 'white' : 'var(--text-main)', boxShadow: activeTab === 'hotspots' ? 'var(--neu-flat)' : 'var(--neu-inset)' }}
              onClick={() => setActiveTab('hotspots')}
            >
              Cluster Hotspots
            </button>
            <button 
              className={`button-primary ${activeTab === 'junctions' ? '' : 'inactive'}`}
              style={{ backgroundColor: activeTab === 'junctions' ? 'var(--primary-btn)' : 'rgba(0,0,0,0.05)', color: activeTab === 'junctions' ? 'white' : 'var(--text-main)', boxShadow: activeTab === 'junctions' ? 'var(--neu-flat)' : 'var(--neu-inset)' }}
              onClick={() => setActiveTab('junctions')}
            >
              Junction Hotspots
            </button>
          </div>
        </div>
      )}
      
      <div style={isFullscreen ? { height: '100%', width: '100%', position: 'relative' } : mapBoxStyle}>
        <button 
          onClick={() => setIsFullscreen(!isFullscreen)}
          style={{ 
            position: 'absolute', 
            top: '20px', 
            right: '20px', 
            zIndex: 1000, 
            padding: '10px', 
            borderRadius: '12px', 
            backgroundColor: 'var(--bg-base)', 
            border: 'none', 
            cursor: 'pointer', 
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-main)'
          }}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Map"}
        >
          {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
        </button>

        <MapContainer 
          preferCanvas={true} 
          center={BANGALORE_CENTER} 
          zoom={12} 
          style={{ height: '100%', width: '100%' }}
        >
          <MapResizer isFullscreen={isFullscreen} />
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {activeTab === 'hotspots' ? renderMarkers(data) : renderMarkers(junctionData)}
        </MapContainer>
      </div>
    </div>
  );
};
