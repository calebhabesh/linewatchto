import urllib.request
import json
import webbrowser
import threading
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

def parse_textproto_alerts(text):
    entities = []
    current_entity = None
    lines = text.split('\n')
    depth = 0
    path = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        opens = line.count('{')
        closes = line.count('}')
        block_name = ""
        if opens > 0:
            block_name = line.split('{')[0].strip()
            
        for _ in range(closes):
            if path:
                path.pop()
            depth -= 1
            if depth == 0 and current_entity:
                entities.append(current_entity)
                current_entity = None
                
        if opens > 0:
            path.append(block_name)
            depth += 1
            if block_name == 'entity':
                current_entity = {
                    'id': '',
                    'route_ids': [],
                    'effect': '',
                    'title': '',
                    'description': '',
                    'url': '',
                    'active_period': {'start': '0001-01-01T00:00:00Z', 'end': '0001-01-01T00:00:00Z'},
                    '_category': 'gtfsrt',
                    'routeType': 'Bus',
                    'alertType': 'Planned',
                    'severity': 'Moderate',
                    'lastUpdated': '2026-06-14T18:00:00Z'
                }
            continue
            
        if current_entity is None:
            continue
            
        if ':' in line:
            key, val = line.split(':', 1)
            key = key.strip()
            val = val.strip().strip('"').replace('\\"', '"')
            
            if key == 'id' and 'entity' in path and len(path) == 1:
                current_entity['id'] = val
            elif key == 'route_id' and 'informed_entity' in path:
                current_entity['route_ids'].append(val)
                if val in ('1', '2', '4'):
                    current_entity['routeType'] = 'Subway'
                elif val in ('5', '6'):
                    current_entity['routeType'] = 'LRT'
                elif val.startswith('5') and len(val) == 3:
                    current_entity['routeType'] = 'Streetcar'
                else:
                    current_entity['routeType'] = 'Bus'
                current_entity['route'] = val
            elif key == 'effect':
                current_entity['effect'] = val
            elif key == 'start' and 'active_period' in path:
                try:
                    dt = datetime.datetime.fromtimestamp(int(val), datetime.timezone.utc)
                    current_entity['active_period']['start'] = dt.isoformat().replace('+00:00', 'Z')
                    current_entity['lastUpdated'] = current_entity['active_period']['start']
                except:
                    pass
            elif key == 'end' and 'active_period' in path:
                try:
                    dt = datetime.datetime.fromtimestamp(int(val), datetime.timezone.utc)
                    current_entity['active_period']['end'] = dt.isoformat().replace('+00:00', 'Z')
                except:
                    pass
            elif key == 'text':
                if 'header_text' in path:
                    current_entity['title'] = val
                elif 'description_text' in path:
                    current_entity['description'] = val
                elif 'url' in path:
                    current_entity['url'] = val
                    
    return entities

def fetch_data():
    url_live = "https://alerts.ttc.ca/api/alerts/live-alerts"
    req_live = urllib.request.Request(url_live, headers={'User-Agent': 'Mozilla/5.0'})
    print(f"Fetching live alerts from {url_live}...")
    
    url_gtfs = "https://gtfsrt.ttc.ca/alerts/all?format=text"
    req_gtfs = urllib.request.Request(url_gtfs, headers={'User-Agent': 'Mozilla/5.0'})
    print(f"Fetching GTFS-RT alerts from {url_gtfs}...")
    
    data_live = None
    try:
        with urllib.request.urlopen(req_live) as response:
            data_live = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error fetching live alerts: {e}")
        
    gtfs_alerts = []
    try:
        with urllib.request.urlopen(req_gtfs) as response:
            text_gtfs = response.read().decode('utf-8')
            gtfs_alerts = parse_textproto_alerts(text_gtfs)
    except Exception as e:
        print(f"Error fetching GTFS-RT alerts: {e}")
        
    if not data_live:
        data_live = {}
        
    data_live['gtfsrt'] = gtfs_alerts
    return data_live

def generate_html(data):
    # Serialized json to inject directly into javascript
    json_data = json.dumps(data) if data else "null"

    html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LineWatchTO — Raw Alerts Explorer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #090a0f;
      --card-bg: #11131c;
      --card-border: rgba(255, 255, 255, 0.05);
      --card-border-hover: rgba(255, 255, 255, 0.12);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      
      --color-ingested-bg: rgba(16, 185, 129, 0.1);
      --color-ingested-text: #10b981;
      --color-ingested-border: rgba(16, 185, 129, 0.2);
      
      --color-ignored-bg: rgba(107, 114, 128, 0.1);
      --color-ignored-text: #9ca3af;
      --color-ignored-border: rgba(107, 114, 128, 0.2);

      --color-warning-bg: rgba(245, 158, 11, 0.1);
      --color-warning-text: #f59e0b;
      --color-warning-border: rgba(245, 158, 11, 0.2);

      --color-danger-bg: rgba(239, 68, 68, 0.1);
      --color-danger-text: #ef4444;
      --color-danger-border: rgba(239, 68, 68, 0.2);
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: var(--bg-color);
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.03) 0%, transparent 40%);
      color: var(--text-main);
      padding: 24px;
      min-height: 100vh;
      line-height: 1.5;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    
    .header-title {
      font-family: 'Outfit', sans-serif;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .header-logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--accent) 0%, #4f46e5 100%);
      color: white;
      width: 38px;
      height: 38px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 20px;
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
    }
    
    .refresh-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.05);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      color: var(--text-muted);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .refresh-dot {
      width: 8px;
      height: 8px;
      background-color: var(--color-ingested-text);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 20px;
      position: relative;
      overflow: hidden;
      transition: all 0.2s ease;
    }
    
    .stat-card:hover {
      border-color: var(--card-border-hover);
      transform: translateY(-2px);
    }
    
    .stat-label {
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    
    .stat-value {
      font-family: 'Outfit', sans-serif;
      font-size: 32px;
      font-weight: 700;
      line-height: 1;
    }
    
    .stat-card.ingested {
      border-left: 4px solid var(--color-ingested-text);
    }
    
    .stat-card.ignored {
      border-left: 4px solid var(--color-ignored-text);
    }
    
    .controls-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .search-row {
      display: flex;
      gap: 12px;
    }
    
    .search-input {
      flex: 1;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: var(--text-main);
      padding: 12px 16px;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s ease;
    }
    
    .search-input:focus {
      border-color: var(--accent);
      background: rgba(255, 255, 255, 0.05);
    }
    
    .select-input {
      background: #171926;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: var(--text-main);
      padding: 12px 32px 12px 16px;
      font-size: 14px;
      outline: none;
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%%239ca3af'%%3E%%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%%3E%%3C/path%3E%%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 16px;
      transition: border-color 0.2s ease;
    }
    
    .select-input:focus {
      border-color: var(--accent);
    }
    
    .filters-row {
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 14px;
    }
    
    .filter-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .filter-label {
      color: var(--text-muted);
      font-weight: 500;
      min-width: 130px;
    }
    
    .filter-chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    
    .filter-chip {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      color: var(--text-muted);
      padding: 6px 12px;
      border-radius: 16px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    
    .filter-chip:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
    }
    
    .filter-chip.active {
      background: rgba(99, 102, 241, 0.15);
      border-color: var(--accent);
      color: #a5b4fc;
    }
    
    .alerts-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 40px;
    }
    
    .alert-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      overflow: hidden;
      transition: all 0.2s ease;
      position: relative;
    }
    
    .alert-card:hover {
      border-color: var(--card-border-hover);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    
    .alert-card-header {
      padding: 16px 20px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      user-select: none;
    }
    
    .alert-main-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .alert-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    
    .badge {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    
    .badge-ingested {
      background: var(--color-ingested-bg);
      color: var(--color-ingested-text);
      border-color: var(--color-ingested-border);
    }
    
    .badge-ignored {
      background: var(--color-ignored-bg);
      color: var(--color-ignored-text);
      border-color: var(--color-ignored-border);
    }
    
    .badge-unresolved {
      background: var(--color-warning-bg);
      color: var(--color-warning-text);
      border-color: var(--color-warning-border);
    }
    
    .badge-category {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-muted);
      border-color: rgba(255, 255, 255, 0.08);
    }
    
    .badge-planned {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
      border-color: rgba(59, 130, 246, 0.2);
    }
    
    .badge-live {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.2);
    }
    
    .badge-severity-critical {
      background: rgba(239, 68, 68, 0.2);
      color: #fca5a5;
      border-color: rgba(239, 68, 68, 0.3);
    }
    
    .badge-severity-moderate {
      background: rgba(245, 158, 11, 0.15);
      color: #fcd34d;
      border-color: rgba(245, 158, 11, 0.25);
    }
    
    .alert-title {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
      line-height: 1.4;
    }
    
    .alert-description {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    
    .alert-meta-side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      font-size: 12px;
      color: var(--text-muted);
      min-width: 140px;
      text-align: right;
    }
    
    .time-relative {
      font-weight: 600;
      color: #fff;
    }
    
    .chevron-icon {
      transition: transform 0.2s ease;
      color: var(--text-muted);
      align-self: center;
      display: inline-flex;
    }
    
    .alert-card.open .chevron-icon {
      transform: rotate(180deg);
    }
    
    .alert-details {
      display: none;
      padding: 20px;
      background: #0a0b12;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .alert-card.open .alert-details {
      display: block;
    }
    
    .details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
    
    .detail-item {
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.03);
      padding: 12px;
      border-radius: 6px;
    }
    
    .detail-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 4px;
      font-weight: 600;
    }
    
    .detail-value {
      font-size: 13px;
      font-weight: 500;
    }
    
    .json-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    
    .json-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    }
    
    .copy-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--text-muted);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .copy-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }
    
    pre {
      background: #050609;
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
      font-family: 'Fira Code', monospace;
      font-size: 12px;
      color: #a5b4fc;
      max-height: 400px;
    }
    
    .line-indicator-strip {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
    }
    
    .line-1 { background-color: #ffd54f; }
    .line-2 { background-color: #4caf50; }
    .line-4 { background-color: #9c27b0; }
    .line-5 { background-color: #ff9800; }
    .line-6 { background-color: #00bcd4; }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      color: var(--text-muted);
    }
    
    .empty-title {
      font-family: 'Outfit', sans-serif;
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title">
        <span class="header-logo">LW</span>
        LineWatchTO — Raw Alerts Ingestion Explorer
      </div>
      <div class="refresh-badge">
        <span class="refresh-dot"></span>
        Auto-refreshes every 30s
      </div>
    </header>
    
    <!-- Metrics Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Raw Alerts</div>
        <div class="stat-value" id="stat-total">0</div>
      </div>
      <div class="stat-card ingested">
        <div class="stat-label">Ingested by Backend</div>
        <div class="stat-value" id="stat-ingested" style="color: var(--color-ingested-text);">0</div>
      </div>
      <div class="stat-card ignored">
        <div class="stat-label">Ignored by Backend</div>
        <div class="stat-value" id="stat-ignored">0</div>
      </div>
      <div class="stat-card" style="border-left: 4px solid var(--accent);">
        <div class="stat-label">Subway / LRT Alerts</div>
        <div class="stat-value" id="stat-subway" style="color: #a5b4fc;">0</div>
      </div>
    </div>
    
    <!-- Controls Panel -->
    <div class="controls-panel">
      <div class="search-row">
        <input type="text" id="search-bar" class="search-input" placeholder="Search alerts by title, description, route, or station...">
        <select id="sort-by" class="select-input">
          <option value="updated-desc">Updated (Newest First)</option>
          <option value="updated-asc">Updated (Oldest First)</option>
          <option value="priority-desc">Priority (High to Low)</option>
          <option value="route-asc">Route Number (A to Z)</option>
        </select>
      </div>
      
      <div class="filters-row">
        <div class="filter-group">
          <span class="filter-label">Ingestion Status:</span>
          <div class="filter-chips" id="filter-ingestion">
            <span class="filter-chip active" data-value="all">All</span>
            <span class="filter-chip" data-value="ingested">Ingested</span>
            <span class="filter-chip" data-value="ignored">Ignored</span>
            <span class="filter-chip" data-value="unresolved">Unresolved (Fixable)</span>
          </div>
        </div>
        
        <div class="filter-group">
          <span class="filter-label">Category:</span>
          <div class="filter-chips" id="filter-category">
            <span class="filter-chip active" data-value="all">All</span>
            <span class="filter-chip" data-value="routes">Routes</span>
            <span class="filter-chip" data-value="accessibility">Accessibility</span>
            <span class="filter-chip" data-value="stops">Stops</span>
            <span class="filter-chip" data-value="siteWide">SiteWide</span>
            <span class="filter-chip" data-value="gtfsrt">GTFS-RT Feed</span>
          </div>
        </div>
        
        <div class="filter-group">
          <span class="filter-label">Route Type:</span>
          <div class="filter-chips" id="filter-routetype">
            <span class="filter-chip active" data-value="all">All</span>
            <span class="filter-chip" data-value="subway">Subway</span>
            <span class="filter-chip" data-value="lrt">LRT</span>
            <span class="filter-chip" data-value="streetcar">Streetcar</span>
            <span class="filter-chip" data-value="bus">Bus</span>
            <span class="filter-chip" data-value="elevator">Elevator</span>
            <span class="filter-chip" data-value="escalator">Escalator</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Alerts List -->
    <div class="alerts-list" id="alerts-container">
      <!-- Dynamic list -->
    </div>
  </div>

  <script>
    // Injected Raw Data
    const RAW_DATA = """ + json_data + """;
    
    // Flatten alerts
    const alerts = [];
    const categories = ['routes', 'accessibility', 'stops', 'siteWide', 'siteWideCustom', 'generalCustom', 'gtfsrt'];
    
    if (RAW_DATA) {
      categories.forEach(cat => {
        const items = RAW_DATA[cat];
        if (items) {
          if (Array.isArray(items)) {
            items.forEach(item => {
              item._category = cat;
              alerts.push(item);
            });
          } else {
            items._category = cat;
            alerts.push(items);
          }
        }
      });
    }
    
    // Ingestion evaluation logic
    function evaluateIngestion(alert) {
      const cat = alert._category;
      const routeType = (alert.routeType || '').toLowerCase();
      const route = (alert.route || '').trim();
      const headerText = alert.headerText || '';
      const id = alert.id || '';
      
      if (!id) {
        return { status: 'ignored', reason: 'Missing Alert ID' };
      }
      
      if (cat === 'routes' || cat === 'gtfsrt') {
        if (routeType !== 'subway' && routeType !== 'lrt') {
          return { status: 'ignored', reason: `Ignored route type '${alert.routeType}' (only Subway/LRT are ingested)` };
        }
        if (!['1', '2', '4', '5', '6'].includes(route)) {
          return { status: 'ignored', reason: `Ignored route Line '${route}' (only Lines 1, 2, 4, 5, 6 are ingested)` };
        }
        return { status: 'ingested', reason: `Rapid transit route alert on Line ${route} (${alert.routeType})` };
      } else if (cat === 'accessibility') {
        if (routeType !== 'elevator' && routeType !== 'escalator') {
          return { status: 'ignored', reason: `Ignored accessibility asset type '${alert.routeType}' (only Elevator/Escalator are ingested)` };
        }
        if (!headerText.includes(':')) {
          return { status: 'unresolved', reason: `Station unresolved: no ':' found in header text to extract station name` };
        }
        const stationPart = headerText.split(':')[0].trim();
        if (!stationPart) {
          return { status: 'unresolved', reason: `Station unresolved: empty prefix before ':'` };
        }
        return { status: 'ingested', reason: `Accessibility outage at ${stationPart} (${alert.routeType})` };
      } else {
        return { status: 'ignored', reason: `Category '${cat}' is completely ignored by backend` };
      }
    }
    
    // Evaluate all alerts
    alerts.forEach(alert => {
      alert._ingestion = evaluateIngestion(alert);
    });
    
    // Update dashboard statistics
    function updateStats() {
      document.getElementById('stat-total').textContent = alerts.length;
      document.getElementById('stat-ingested').textContent = alerts.filter(a => a._ingestion.status === 'ingested').length;
      document.getElementById('stat-ignored').textContent = alerts.filter(a => a._ingestion.status === 'ignored').length;
      
      const subwayLrt = alerts.filter(a => {
        const rt = (a.routeType || '').toLowerCase();
        return rt === 'subway' || rt === 'lrt';
      }).length;
      document.getElementById('stat-subway').textContent = subwayLrt;
    }
    
    function formatRelativeTime(dateStr) {
      if (!dateStr || dateStr.startsWith('0001-')) return 'N/A';
      try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
      } catch (e) {
        return 'Invalid Date';
      }
    }
    
    function formatAbsoluteTime(dateStr) {
      if (!dateStr || dateStr.startsWith('0001-')) return 'N/A';
      try {
        const date = new Date(dateStr);
        return date.toLocaleString();
      } catch (e) {
        return 'N/A';
      }
    }
    
    // Filtering active states
    let activeFilters = {
      search: '',
      ingestion: 'all',
      category: 'all',
      routetype: 'all',
      sortBy: 'updated-desc'
    };
    
    function getFilteredAlerts() {
      let filtered = [...alerts];
      
      // Search
      if (activeFilters.search) {
        const q = activeFilters.search.toLowerCase();
        filtered = filtered.filter(a => 
          (a.title || '').toLowerCase().includes(q) ||
          (a.headerText || '').toLowerCase().includes(q) ||
          (a.description || '').toLowerCase().includes(q) ||
          (a.route || '').toLowerCase().includes(q) ||
          (a.stopStart || '').toLowerCase().includes(q) ||
          (a.stopEnd || '').toLowerCase().includes(q)
        );
      }
      
      // Ingestion Status
      if (activeFilters.ingestion !== 'all') {
        filtered = filtered.filter(a => a._ingestion.status === activeFilters.ingestion);
      }
      
      // Category
      if (activeFilters.category !== 'all') {
        filtered = filtered.filter(a => a._category === activeFilters.category);
      }
      
      // Route Type
      if (activeFilters.routetype !== 'all') {
        filtered = filtered.filter(a => (a.routeType || '').toLowerCase() === activeFilters.routetype);
      }
      
      // Sort
      filtered.sort((a, b) => {
        if (activeFilters.sortBy === 'updated-desc') {
          return new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0);
        } else if (activeFilters.sortBy === 'updated-asc') {
          return new Date(a.lastUpdated || 0) - new Date(b.lastUpdated || 0);
        } else if (activeFilters.sortBy === 'priority-desc') {
          return (b.priority || 0) - (a.priority || 0);
        } else if (activeFilters.sortBy === 'route-asc') {
          const rA = a.route || '';
          const rB = b.route || '';
          const numA = parseInt(rA, 10);
          const numB = parseInt(rB, 10);
          if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
          }
          return rA.localeCompare(rB);
        }
        return 0;
      });
      
      return filtered;
    }
    
    window.copyAlertJson = function(idx, btnId) {
      const alertData = getFilteredAlerts()[idx];
      const cleanAlert = {...alertData};
      delete cleanAlert._category;
      delete cleanAlert._ingestion;
      
      navigator.clipboard.writeText(JSON.stringify(cleanAlert, null, 2)).then(() => {
        const btn = document.getElementById(btnId);
        const origText = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        setTimeout(() => { btn.innerHTML = origText; }, 2000);
      });
    };
    
    window.toggleCard = function(cardId) {
      const card = document.getElementById(cardId);
      card.classList.toggle('open');
    };
    
    function renderAlerts() {
      const container = document.getElementById('alerts-container');
      const list = getFilteredAlerts();
      
      if (list.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-title">No alerts match your search or filter criteria</div>
            <p>Try clearing your filters or search query to see more raw data.</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = list.map((a, idx) => {
        const cardId = `alert-card-${idx}`;
        const copyBtnId = `copy-btn-${idx}`;
        const title = a.title || a.headerText || a.customHeaderText || `Alert ID: ${a.id || 'Unknown'}`;
        const age = formatRelativeTime(a.lastUpdated);
        const absTime = formatAbsoluteTime(a.lastUpdated);
        
        let ingBadgeClass = 'badge-ignored';
        let ingText = 'Ignored';
        if (a._ingestion.status === 'ingested') {
          ingBadgeClass = 'badge-ingested';
          ingText = '✓ Ingested';
        } else if (a._ingestion.status === 'unresolved') {
          ingBadgeClass = 'badge-unresolved';
          ingText = '⚠️ Unresolved';
        }
        
        const sev = (a.severity || '').toLowerCase();
        let sevBadgeClass = 'badge-category';
        if (sev === 'critical') sevBadgeClass = 'badge-severity-critical';
        else if (sev === 'moderate') sevBadgeClass = 'badge-severity-moderate';
        
        const type = (a.alertType || '').toLowerCase();
        const typeBadgeClass = type === 'planned' ? 'badge-planned' : 'badge-live';
        
        let lineIndicator = '';
        const rt = (a.route || '').trim();
        if (a._category === 'routes' && ['1', '2', '4', '5', '6'].includes(rt)) {
          lineIndicator = `<div class="line-indicator-strip line-${rt}"></div>`;
        }
        
        return `
          <div class="alert-card" id="${cardId}">
            ${lineIndicator}
            <div class="alert-card-header" onclick="toggleCard('${cardId}')">
              <div class="alert-main-info">
                <div class="alert-badges">
                  <span class="badge ${ingBadgeClass}" title="${a._ingestion.reason}">${ingText}</span>
                  <span class="badge badge-category">${a._category}</span>
                  <span class="badge ${typeBadgeClass}">${a.alertType || 'Live'}</span>
                  ${a.routeType ? `<span class="badge badge-category">${a.routeType}</span>` : ''}
                  ${a.route ? `<span class="badge badge-category">Route ${a.route}</span>` : ''}
                  ${a.severity ? `<span class="badge ${sevBadgeClass}">${a.severity}</span>` : ''}
                </div>
                <div class="alert-title">${title}</div>
                ${a.description ? `<div class="alert-description">${a.description}</div>` : ''}
              </div>
              <div class="alert-meta-side">
                <div class="time-relative">${age}</div>
                <div>Updated: ${absTime.split(',')[0]}</div>
                <div class="chevron-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            
            <div class="alert-details">
              <div class="details-grid">
                <div class="detail-item">
                  <div class="detail-title">Ingestion Status</div>
                  <div class="detail-value" style="color: ${a._ingestion.status === 'ingested' ? 'var(--color-ingested-text)' : 'inherit'}; font-weight: 600;">
                    ${a._ingestion.status.toUpperCase()}
                  </div>
                  <div class="detail-value" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                    ${a._ingestion.reason}
                  </div>
                </div>
                <div class="detail-item">
                  <div class="detail-title">Timeline & Period</div>
                  <div class="detail-value">
                    Start: ${formatAbsoluteTime(a.activePeriod ? a.activePeriod.start : null)}
                  </div>
                  <div class="detail-value" style="margin-top: 4px;">
                    End: ${formatAbsoluteTime(a.activePeriod ? a.activePeriod.end : null)}
                  </div>
                </div>
                <div class="detail-item">
                  <div class="detail-title">Attributes</div>
                  <div class="detail-value">Effect: ${a.effect || 'N/A'} (${a.effectDesc || 'N/A'})</div>
                  <div class="detail-value" style="margin-top: 4px;">Cause: ${a.cause || 'N/A'} (${a.causeDescription || 'N/A'})</div>
                </div>
              </div>
              
              <div class="json-header">
                <div class="json-title">RAW RECORD JSON (ID: ${a.id})</div>
                <button class="copy-btn" id="${copyBtnId}" onclick="copyAlertJson(${idx}, '${copyBtnId}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy JSON
                </button>
              </div>
              <pre>${JSON.stringify(a, null, 2)}</pre>
            </div>
          </div>
        `;
      }).join('');
    }
    
    // Attach event listeners
    document.getElementById('search-bar').addEventListener('input', (e) => {
      activeFilters.search = e.target.value;
      renderAlerts();
    });
    
    document.getElementById('sort-by').addEventListener('change', (e) => {
      activeFilters.sortBy = e.target.value;
      renderAlerts();
    });
    
    function setupChips(containerId, filterKey) {
      const container = document.getElementById(containerId);
      container.addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        
        container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        
        activeFilters[filterKey] = chip.dataset.value;
        renderAlerts();
      });
    }
    
    setupChips('filter-ingestion', 'ingestion');
    setupChips('filter-category', 'category');
    setupChips('filter-routetype', 'routetype');
    
    // Auto-refresh mechanism (checks for new data in background every 30s)
    setInterval(() => {
      console.log("Auto-refreshing page...");
      window.location.reload();
    }, 30000);
    
    // Render initially
    updateStats();
    renderAlerts();
  </script>
</body>
</html>"""
    return html

class TTCRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/html; charset=utf-8')
        self.end_headers()
        
        data = fetch_data()
        html_content = generate_html(data)
        
        self.wfile.write(html_content.encode('utf-8'))
        
    def log_message(self, format, *args):
        # Suppress HTTP server logging output to keep the terminal clean
        pass

def main():
    port = 8085
    server = HTTPServer(('127.0.0.1', port), TTCRequestHandler)
    url = f"http://127.0.0.1:{port}"
    
    print(f"Starting local TTC alert server at {url}")
    print("Press Ctrl+C to stop.")
    
    # Open browser in a separate thread so it doesn't block the server starting
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()

if __name__ == "__main__":
    main()
