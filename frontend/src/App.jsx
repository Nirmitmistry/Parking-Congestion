import React, { useEffect, useState } from 'react';
import { loadHotspots, loadJunctionHotspots } from './utils/dataLoader';
import { KPIRow } from './components/KPIRow';
import { DashboardMap } from './components/DashboardMap';
import { PriorityTable } from './components/PriorityTable';
import { Charts } from './components/Charts';
import { HourOfDayChart } from './components/HourOfDayChart';
import { JunctionTable } from './components/JunctionTable';
import { PatrolShiftTable } from './components/PatrolShiftTable';
import { ROISimulator } from './components/ROISimulator';
import { LayoutDashboard, Upload, Menu, ChevronLeft } from 'lucide-react';

function App() {
  const [data, setData] = useState([]);
  const [junctionData, setJunctionData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stationFilter, setStationFilter] = useState('All');
  const [roadFilter, setRoadFilter] = useState('All');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [hotspots, junctions] = await Promise.all([
          loadHotspots(),
          loadJunctionHotspots()
        ]);
        hotspots.sort((a, b) => (a.enforcement_rank || Infinity) - (b.enforcement_rank || Infinity));
        setData(hotspots);
        setJunctionData(junctions);
      } catch (error) {
        console.error("Error loading CSV data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stations = ['All', ...new Set(data.map(d => d.main_police_station).filter(Boolean))].sort();
  const roadTypes = ['All', ...new Set(data.map(d => d.dominant_road_type).filter(Boolean))].sort();

  const filteredData = data.filter(d => {
    if (stationFilter !== 'All' && d.main_police_station !== stationFilter) return false;
    if (roadFilter !== 'All' && d.dominant_road_type !== roadFilter) return false;
    return true;
  });

  const filteredJunctionData = junctionData.filter(d => {
    if (stationFilter !== 'All' && d.main_police_station !== stationFilter) return false;
    return true;
  });

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? '' : 'minimized'}`}>
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isSidebarOpen && (
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--sidebar-text)', margin: 0 }}>
              <LayoutDashboard size={24} />
              Traffic AI
            </h2>
          )}
          {!isSidebarOpen && <LayoutDashboard size={24} style={{ color: 'var(--sidebar-text)', margin: '0 auto' }} />}
          
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--sidebar-text)', 
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isSidebarOpen ? <ChevronLeft size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isSidebarOpen && (
          <>
            <p style={{ fontSize: '0.85rem', marginTop: '-16px' }}>AI-Driven Parking Intelligence Dashboard.</p>

            <div className="card">
              <h4 style={{ marginBottom: '12px' }}>Filters</h4>
              <div style={{ marginBottom: '16px' }}>
                <label>Police Station Jurisdiction</label>
                <select className="select-input" value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}>
                  {stations.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label>Road Type</label>
                <select className="select-input" value={roadFilter} onChange={(e) => setRoadFilter(e.target.value)}>
                  {roadTypes.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="card">
              <h4 style={{ marginBottom: '12px' }}>Data Upload</h4>
              <input type="file" className="file-input" style={{ marginBottom: '16px' }} />
              <button className="button-primary" style={{ width: '100%' }}>
                <Upload size={18} /> Run Pipeline
              </button>
              <p style={{ fontSize: '0.75rem', marginTop: '12px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
                Requires Python backend.
              </p>
            </div>
          </>
        )}
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div style={{ backgroundColor: 'var(--bg-sidebar)', padding: '32px 40px', borderRadius: '20px', color: 'white', marginBottom: '32px', boxShadow: '0 8px 24px rgba(15, 58, 68, 0.15)' }}>
          <h1 style={{ color: 'white', margin: 0 }}>Parking Intelligence Dashboard</h1>
          <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.85)', margin: '12px 0 0 0' }}>
            Detecting confirmed illegal parking hotspots and <strong style={{ color: 'white' }}>quantifying their impact on traffic flow</strong> to enable targeted, data-driven enforcement.
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <h3>Loading AI Insights...</h3>
          </div>
        ) : (
          <>
            <KPIRow data={filteredData} />
            
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(350px, 1fr)', gap: '24px', marginBottom: '24px' }}>
              <DashboardMap data={filteredData} junctionData={filteredJunctionData} />
              <PriorityTable data={filteredData} />
            </div>

            <Charts data={filteredData} />
            <HourOfDayChart data={filteredData} />
            <JunctionTable data={filteredJunctionData} />
            <PatrolShiftTable data={filteredData} />
            <ROISimulator data={filteredData} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
