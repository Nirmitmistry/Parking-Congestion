import Papa from 'papaparse';

export const loadHotspots = async () => {
  return new Promise((resolve, reject) => {
    Papa.parse('/hotspots.csv', {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data.map(row => {
          // Parse JSON columns
          ['monthly_breakdown', 'hour_breakdown_json', 'dow_breakdown_json', 'vehicle_mix_json'].forEach(col => {
            if (row[col] && typeof row[col] === 'string') {
              try {
                // Ensure valid JSON by replacing single quotes with double quotes
                let jsonStr = row[col].replace(/'/g, '"');
                row[col] = JSON.parse(jsonStr);
              } catch (e) {
                row[col] = {};
              }
            } else if (!row[col]) {
              row[col] = {};
            }
          });
          
          if (row.chronic !== undefined) {
            row.chronic = String(row.chronic).toLowerCase() === 'true';
          }
          return row;
        });
        resolve(data);
      },
      error: (error) => reject(error)
    });
  });
};

export const loadJunctionHotspots = async () => {
  return new Promise((resolve, reject) => {
    Papa.parse('/junction_hotspots.csv', {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: (error) => reject(error)
    });
  });
};
