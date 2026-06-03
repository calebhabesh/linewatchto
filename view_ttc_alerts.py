import urllib.request
import json
import webbrowser
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

def fetch_data():
    url = "https://alerts.ttc.ca/api/alerts/live-alerts"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    print(f"Fetching live alerts from {url}...")
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error fetching data: {e}")
        return None

def generate_html(data):
    html = [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        "<meta charset='utf-8'>",
        "<meta http-equiv='refresh' content='30'>",
        "<title>TTC Live Alerts Viewer</title>",
        "<style>",
        "  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #121212; color: #e0e0e0; padding: 20px; max-width: 1200px; margin: 0 auto; }",
        "  h1 { border-bottom: 1px solid #333; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }",
        "  .refresh-indicator { font-size: 0.5em; color: #888; font-weight: normal; }",
        "  h2 { margin-top: 30px; color: #ff9800; }",
        "  details { background: #1e1e1e; margin-bottom: 10px; padding: 12px; border-radius: 6px; border: 1px solid #333; }",
        "  summary { cursor: pointer; font-weight: bold; font-size: 1.1em; outline: none; }",
        "  summary:hover { color: #fff; }",
        "  pre { background: #000; padding: 15px; border-radius: 6px; overflow-x: auto; color: #a6e22e; font-size: 0.9em; margin-top: 10px; border: 1px solid #333; }",
        "  .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 0.8em; font-weight: normal; margin-left: 10px; background: #333; color: #ddd; }",
        "  .critical { background: #d32f2f; color: white; }",
        "  .planned { background: #1976d2; color: white; }",
        "</style>",
        "</head>",
        "<body>",
        "<h1>TTC Live Alerts Raw Viewer <span class='refresh-indicator'>Auto-refreshes every 30s</span></h1>"
    ]

    if not data:
        html.append("<p>Error fetching data from TTC API.</p></body></html>")
        return "\n".join(html)

    categories = ['routes', 'accessibility', 'stops', 'siteWide', 'siteWideCustom', 'generalCustom']
    for category in categories:
        alerts = data.get(category)
        if not alerts:
            continue
            
        html.append(f"<h2>{category.capitalize()} ({len(alerts) if isinstance(alerts, list) else 1})</h2>")
        
        if isinstance(alerts, list):
            for alert in alerts:
                title = alert.get('title') or alert.get('headerText') or alert.get('customHeaderText') or f"Alert ID: {alert.get('id', 'Unknown')}"
                
                badges = []
                if alert.get('alertType'):
                    alert_type = alert.get('alertType', '').lower()
                    css_class = 'planned' if alert_type == 'planned' else ''
                    badges.append(f"<span class='badge {css_class}'>{alert.get('alertType')}</span>")
                if alert.get('severity'):
                    severity = alert.get('severity', '').lower()
                    css_class = 'critical' if severity == 'critical' else ''
                    badges.append(f"<span class='badge {css_class}'>{alert.get('severity')}</span>")
                if alert.get('route'):
                    badges.append(f"<span class='badge'>Route {alert.get('route')}</span>")
                    
                badges_html = "".join(badges)
                
                html.append("<details>")
                html.append(f"<summary>{title} {badges_html}</summary>")
                html.append(f"<pre>{json.dumps(alert, indent=2)}</pre>")
                html.append("</details>")
        else:
            html.append("<details>")
            html.append(f"<summary>{category} Object</summary>")
            html.append(f"<pre>{json.dumps(alerts, indent=2)}</pre>")
            html.append("</details>")

    html.append("</body></html>")
    return "\n".join(html)

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
