"""
FrndlyTV / YuppTV — RCA Live Dashboard Generator
Generates docs/index.html (GitHub Pages compatible, fully self-contained).

Usage:
    python3 rca_dashboard.py          # regenerate the dashboard
    git add docs/index.html && git commit -m "Update RCA dashboard" && git push

To add a new incident: append a row to the `incidents` list below, then rerun.
"""

import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import pandas as pd
import numpy as np
from datetime import datetime
import os

# ── Incident data ─────────────────────────────────────────────────────────────
# To add a new incident, copy any row and update the fields.
incidents = [
    # Theme 1: Live Feed / Channel Disruptions
    {"id":  1, "date": "2025-04-21", "theme": "Live Feed",       "severity": "Critical", "channel": "Catchy Comedy",  "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Low bitrate on Catchy Comedy primary & secondary feeds"},
    {"id":  2, "date": "2025-04-17", "theme": "Live Feed",       "severity": "Critical", "channel": "Cowboy Way",     "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Low bitrate on Cowboy Way primary & secondary feeds"},
    {"id":  3, "date": "2025-06-13", "theme": "Live Feed",       "severity": "Critical", "channel": "Pixl",           "devices": "All",            "blocker": False, "recur": True,  "ticket": "FTV-9936",  "summary": "Pixl A/V desync — encoder drift; restart schedule broken"},
    {"id":  4, "date": "2025-03-07", "theme": "Live Feed",       "severity": "High",     "channel": "WFMZ-TV",        "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Feed drop on WFMZ-TV channel 69"},
    {"id":  5, "date": "2025-02-18", "theme": "Live Feed",       "severity": "High",     "channel": "WACY TV32",      "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Feed drop on WACY TV32"},
    {"id":  6, "date": "2025-01-14", "theme": "Live Feed",       "severity": "Critical", "channel": "Weigel (multi)", "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Feed drop on Bounce, Court TV, Laff, Grit, Ion channels"},
    {"id":  7, "date": "2024-12-27", "theme": "Live Feed",       "severity": "Critical", "channel": "Weigel (multi)", "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Feed drop on Weigel channels primary path"},
    {"id":  8, "date": "2024-09-17", "theme": "Live Feed",       "severity": "High",     "channel": "MeTV group",     "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Feed drop MeTV/StoryTV/Catchy Comedy/Heroes secondary"},
    {"id":  9, "date": "2024-09-13", "theme": "Live Feed",       "severity": "Critical", "channel": "FETV/FMC",       "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Low bitrate FETV & FMC — audio glitches/blank screen"},
    {"id": 10, "date": "2024-09-13", "theme": "Live Feed",       "severity": "High",     "channel": "Accuweather",    "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Feed drop on Accuweather primary path"},
    {"id": 11, "date": "2024-09-13", "theme": "Live Feed",       "severity": "High",     "channel": "Pixl",           "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Feed drop on Pixl primary path"},
    {"id": 12, "date": "2024-09-11", "theme": "Live Feed",       "severity": "Critical", "channel": "GSN",            "devices": "All",            "blocker": False, "recur": False, "ticket": "",          "summary": "SCTE markers not received on GSN — zero ad packets"},
    {"id": 13, "date": "2024-08-14", "theme": "Live Feed",       "severity": "High",     "channel": "Pursuit",        "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Feed drop on Pursuit channel primary path"},
    {"id": 14, "date": "2024-06-12", "theme": "Live Feed",       "severity": "High",     "channel": "QVC",            "devices": "All",            "blocker": False, "recur": False, "ticket": "",          "summary": "Brief feed drops on QVC at multiple timestamps"},
    {"id": 15, "date": "2024-06-03", "theme": "Live Feed",       "severity": "Critical", "channel": "MeTV group",     "devices": "All",            "blocker": False, "recur": True,  "ticket": "",          "summary": "Feed drops MeTV/StoryTV/Catchy Comedy/Heroes — blank screen"},
    # Theme 2: App Crashes & Playback
    {"id": 16, "date": "2025-12-09", "theme": "App Crashes",     "severity": "Blocker",  "channel": "N/A",            "devices": "Vizio",          "blocker": True,  "recur": False, "ticket": "FTV-10320", "summary": "Vizio FF/RW excessive buffering — release day regression"},
    {"id": 17, "date": "2025-10-03", "theme": "App Crashes",     "severity": "Critical", "channel": "N/A",            "devices": "Samsung",        "blocker": False, "recur": False, "ticket": "FTV-10149", "summary": "Samsung infinite buffering — Bitmovin SDK v8.228 incompatible"},
    {"id": 18, "date": "2025-08-22", "theme": "App Crashes",     "severity": "Blocker",  "channel": "N/A",            "devices": "Multi-platform", "blocker": True,  "recur": False, "ticket": "FTV-10060", "summary": "Videos not playing across all platforms — code change regression"},
    {"id": 19, "date": "2025-05-26", "theme": "App Crashes",     "severity": "Critical", "channel": "N/A",            "devices": "Roku",           "blocker": False, "recur": False, "ticket": "FTV-9892",  "summary": "Roku warm start crash — release day regression"},
    {"id": 20, "date": "2025-07-23", "theme": "App Crashes",     "severity": "Critical", "channel": "N/A",            "devices": "Multi-platform", "blocker": False, "recur": False, "ticket": "FTV-10008", "summary": "Error codes on Roku/Amazon/Vizio/AndroidTV — Akamai CDN"},
    {"id": 21, "date": "2025-10-09", "theme": "App Crashes",     "severity": "Critical", "channel": "N/A",            "devices": "iPhone",         "blocker": False, "recur": False, "ticket": "FTV-10158", "summary": "iPhone iOS 26 browser error on live programming"},
    {"id": 22, "date": "2024-08-27", "theme": "App Crashes",     "severity": "Blocker",  "channel": "N/A",            "devices": "Fire TV",        "blocker": True,  "recur": False, "ticket": "",          "summary": "Amazon Fire TV app crashes — high CX contact volume"},
    # Theme 3: EPG / Guide / CMS
    {"id": 23, "date": "2025-08-22", "theme": "EPG/CMS",         "severity": "Blocker",  "channel": "N/A",            "devices": "Samsung/Vizio",  "blocker": True,  "recur": False, "ticket": "FTV-10059", "summary": "Guide not loading Samsung/Vizio — duplicate EPG from Gracenote"},
    {"id": 24, "date": "2025-08-22", "theme": "EPG/CMS",         "severity": "Blocker",  "channel": "N/A",            "devices": "All",            "blocker": True,  "recur": False, "ticket": "FTV-10052", "summary": "Duplicate results Coming Soon TV CMS row — Gracenote job"},
    {"id": 25, "date": "2025-04-10", "theme": "EPG/CMS",         "severity": "Critical", "channel": "N/A",            "devices": "All",            "blocker": False, "recur": False, "ticket": "FTV-9796",  "summary": "EPG update inconsistencies — wrong file path undetected"},
    {"id": 26, "date": "2025-04-04", "theme": "EPG/CMS",         "severity": "Blocker",  "channel": "N/A",            "devices": "All",            "blocker": True,  "recur": False, "ticket": "FTV-9795",  "summary": "Blank TiVo Program ID caused Payment Server memory issue"},
    {"id": 27, "date": "2025-10-09", "theme": "EPG/CMS",         "severity": "Critical", "channel": "N/A",            "devices": "All",            "blocker": False, "recur": False, "ticket": "FTV-10156", "summary": "Hero Card images not loading in CMS"},
    # Theme 4: Infrastructure
    {"id": 28, "date": "2023-12-20", "theme": "Infrastructure",  "severity": "Blocker",  "channel": "N/A",            "devices": "All",            "blocker": True,  "recur": False, "ticket": "",          "summary": "Full platform outage — DB upgrade required; customers logged out"},
    {"id": 29, "date": "2024-06-30", "theme": "Infrastructure",  "severity": "Blocker",  "channel": "N/A",            "devices": "All",            "blocker": True,  "recur": False, "ticket": "",          "summary": "SSL cert expiry — 80 min outage (India-only propagation)"},
    {"id": 30, "date": "2024-09-08", "theme": "Infrastructure",  "severity": "Blocker",  "channel": "N/A",            "devices": "All",            "blocker": True,  "recur": False, "ticket": "",          "summary": "Sunday night outage — Guide not loading"},
    # Theme 5: Ads
    {"id": 31, "date": "2025-08-06", "theme": "Ads",             "severity": "Critical", "channel": "Hallmark",       "devices": "All",            "blocker": False, "recur": False, "ticket": "FTV-9935",  "summary": "Hourly Ads Report showing 0 impressions for Hallmark"},
    {"id": 32, "date": "2025-09-22", "theme": "Ads",             "severity": "Blocker",  "channel": "FMC",            "devices": "All",            "blocker": True,  "recur": False, "ticket": "FTV-10124", "summary": "Ad impressions stopped on FMC live — revenue impact"},
    # Theme 6: Search
    {"id": 33, "date": "2025-12-09", "theme": "Search",          "severity": "Blocker",  "channel": "N/A",            "devices": "All",            "blocker": True,  "recur": False, "ticket": "FTV-10330", "summary": "High priority premieres missing from in-app search (TiVo gap)"},
    {"id": 34, "date": "2025-12-09", "theme": "Search",          "severity": "Blocker",  "channel": "N/A",            "devices": "Vizio",          "blocker": True,  "recur": False, "ticket": "FTV-10343", "summary": "The Christmas Spark not searchable on Vizio"},
    # Theme 7: Tooling
    {"id": 35, "date": "2024-06-27", "theme": "Tooling",         "severity": "Critical", "channel": "N/A",            "devices": "N/A",            "blocker": False, "recur": False, "ticket": "",          "summary": "Jira automated ticket creation failure — date inaccuracies"},
    # Theme 8: RCA Process
    {"id": 36, "date": "2025-02-25", "theme": "RCA Process",     "severity": "High",     "channel": "N/A",            "devices": "N/A",            "blocker": False, "recur": False, "ticket": "FTV-9655",  "summary": "RCA submitted without actual root cause identified"},
    # Theme 9: Miscellaneous
    {"id": 37, "date": "2024-10-16", "theme": "Miscellaneous",   "severity": "Critical", "channel": "N/A",            "devices": "Unknown",        "blocker": False, "recur": False, "ticket": "FTV-9221",  "summary": "Incident report — Google Streamer"},
    {"id": 38, "date": "2024-10-08", "theme": "Miscellaneous",   "severity": "Various",  "channel": "N/A",            "devices": "Multiple",       "blocker": False, "recur": False, "ticket": "",          "summary": "Batch RCA reports"},
    {"id": 39, "date": "2024-11-07", "theme": "Miscellaneous",   "severity": "Blocker",  "channel": "N/A",            "devices": "Multiple",       "blocker": True,  "recur": False, "ticket": "",          "summary": "Batch RCA reports for blockers"},
    {"id": 40, "date": "2025-10-07", "theme": "Miscellaneous",   "severity": "Critical", "channel": "N/A",            "devices": "Unknown",        "blocker": False, "recur": False, "ticket": "FTV-10141", "summary": "Updated RCA (attachment)"},
]

df = pd.DataFrame(incidents)
df['date'] = pd.to_datetime(df['date'])
df['month'] = df['date'].dt.to_period('M').dt.to_timestamp()
df['year'] = df['date'].dt.year
df['quarter'] = df['date'].dt.to_period('Q').dt.to_timestamp()

THEME_COLORS = {
    "Live Feed":      "#E74C3C",
    "App Crashes":    "#E67E22",
    "EPG/CMS":        "#F39C12",
    "Infrastructure": "#9B59B6",
    "Ads":            "#27AE60",
    "Search":         "#3498DB",
    "Tooling":        "#1ABC9C",
    "RCA Process":    "#95A5A6",
    "Miscellaneous":  "#7F8C8D",
}
SEV_COLORS = {
    "Blocker":  "#C0392B",
    "Critical": "#E67E22",
    "High":     "#F1C40F",
    "Various":  "#95A5A6",
}

TEMPLATE = "plotly_dark"
PAPER_BG = "#0D1117"
PLOT_BG  = "#161B22"

# ── KPI metrics ───────────────────────────────────────────────────────────────
total      = len(df)
blockers   = int(df['blocker'].sum())
recurring  = int(df['recur'].sum())
themes     = df['theme'].nunique()
last_updated = datetime.now().strftime("%B %d, %Y")

# ── Chart builders ────────────────────────────────────────────────────────────

def incidents_by_theme():
    counts = df.groupby('theme').size().reset_index(name='count').sort_values('count')
    block_map = df[df['blocker']].groupby('theme').size().to_dict()
    counts['blockers'] = counts['theme'].map(lambda t: block_map.get(t, 0))
    counts['color'] = counts['theme'].map(THEME_COLORS)
    counts['label'] = counts.apply(
        lambda r: f"{r['count']} incidents" + (f" · {r['blockers']} blocker{'s' if r['blockers']>1 else ''}" if r['blockers'] else ""),
        axis=1
    )
    fig = go.Figure(go.Bar(
        x=counts['count'], y=counts['theme'],
        orientation='h',
        marker_color=counts['color'].tolist(),
        text=counts['label'], textposition='outside',
        hovertemplate='<b>%{y}</b><br>Incidents: %{x}<extra></extra>',
    ))
    fig.update_layout(
        title='Incidents by Theme', template=TEMPLATE,
        paper_bgcolor=PAPER_BG, plot_bgcolor=PLOT_BG,
        xaxis_title='Incidents', yaxis_title='',
        xaxis=dict(range=[0, counts['count'].max() + 4]),
        margin=dict(l=10, r=160, t=50, b=40), height=380,
    )
    return fig

def monthly_timeline():
    monthly = df.groupby('month').size().reset_index(name='count')
    theme_monthly = df.groupby(['month', 'theme']).size().reset_index(name='count')

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=monthly['month'], y=monthly['count'],
        mode='lines+markers', name='Total',
        line=dict(color='#E74C3C', width=2),
        marker=dict(size=6),
        fill='tozeroy', fillcolor='rgba(231,76,60,0.15)',
        hovertemplate='%{x|%b %Y}: <b>%{y} incidents</b><extra></extra>',
    ))
    fig.update_layout(
        title='Monthly Incident Volume', template=TEMPLATE,
        paper_bgcolor=PAPER_BG, plot_bgcolor=PLOT_BG,
        xaxis_title='', yaxis_title='Incidents',
        yaxis=dict(rangemode='tozero'),
        margin=dict(l=10, r=10, t=50, b=40), height=300,
    )
    return fig

def quarterly_stacked():
    pivot = df.groupby(['quarter', 'theme']).size().reset_index(name='count')
    themes_ordered = df.groupby('theme').size().sort_values(ascending=False).index.tolist()
    fig = go.Figure()
    for theme in themes_ordered:
        sub = pivot[pivot['theme'] == theme]
        fig.add_trace(go.Bar(
            x=sub['quarter'], y=sub['count'],
            name=theme, marker_color=THEME_COLORS.get(theme, '#95A5A6'),
            hovertemplate=f'<b>{theme}</b><br>%{{x|Q%q %Y}}: %{{y}}<extra></extra>',
        ))
    fig.update_layout(
        barmode='stack', title='Quarterly Incidents by Theme',
        template=TEMPLATE, paper_bgcolor=PAPER_BG, plot_bgcolor=PLOT_BG,
        xaxis_title='', yaxis_title='Incidents',
        legend=dict(orientation='h', y=-0.25, x=0),
        margin=dict(l=10, r=10, t=50, b=100), height=380,
    )
    return fig

def severity_donut():
    sev_order = ['Blocker', 'Critical', 'High', 'Various']
    counts = df['severity'].value_counts()
    vals = [counts.get(s, 0) for s in sev_order]
    fig = go.Figure(go.Pie(
        labels=sev_order, values=vals,
        marker_colors=[SEV_COLORS[s] for s in sev_order],
        hole=0.55,
        textinfo='label+percent',
        hovertemplate='<b>%{label}</b><br>%{value} incidents (%{percent})<extra></extra>',
    ))
    fig.add_annotation(text=f"<b>{total}</b><br>Incidents", x=0.5, y=0.5,
                       font_size=16, showarrow=False, font_color='#E0E0E0')
    fig.update_layout(
        title='Severity Distribution', template=TEMPLATE,
        paper_bgcolor=PAPER_BG, showlegend=False,
        margin=dict(l=10, r=10, t=50, b=10), height=320,
    )
    return fig

def device_chart():
    device_map = {
        'All': ['All Platforms'], 'Vizio': ['Vizio'], 'Samsung': ['Samsung'],
        'Samsung/Vizio': ['Samsung', 'Vizio'], 'Roku': ['Roku'],
        'Fire TV': ['Fire TV'], 'iPhone': ['iOS'],
        'Multi-platform': ['Multi-platform'], 'Multiple': ['Multi-platform'],
        'N/A': [], 'Unknown': [],
    }
    counts = {}
    for _, row in df.iterrows():
        for dev in device_map.get(row['devices'], [row['devices']]):
            if dev:
                counts[dev] = counts.get(dev, 0) + 1
    s = pd.Series(counts).sort_values()
    colors = ['#E74C3C' if d == 'All Platforms' else '#3498DB' for d in s.index]
    fig = go.Figure(go.Bar(
        x=s.values, y=s.index, orientation='h',
        marker_color=colors, text=s.values, textposition='outside',
        hovertemplate='<b>%{y}</b>: %{x} incidents<extra></extra>',
    ))
    fig.update_layout(
        title='Incidents by Device / Platform', template=TEMPLATE,
        paper_bgcolor=PAPER_BG, plot_bgcolor=PLOT_BG,
        xaxis=dict(range=[0, s.max() + 4]),
        margin=dict(l=10, r=60, t=50, b=40), height=320,
    )
    return fig

def recurrence_chart():
    rec = df.groupby('theme').apply(
        lambda g: pd.Series({'recur': g['recur'].sum(), 'total': len(g)})
    ).reset_index()
    rec['rate'] = (rec['recur'] / rec['total'] * 100).round(1)
    rec = rec[rec['total'] > 0].sort_values('rate')
    fig = go.Figure(go.Bar(
        x=rec['rate'], y=rec['theme'], orientation='h',
        marker_color=[THEME_COLORS.get(t, '#95A5A6') for t in rec['theme']],
        text=[f"{r}%  ({int(n)}/{int(tot)})" for r, n, tot in zip(rec['rate'], rec['recur'], rec['total'])],
        textposition='outside',
        hovertemplate='<b>%{y}</b><br>Recurrence rate: %{x}%<extra></extra>',
    ))
    fig.update_layout(
        title='Recurrence Rate by Theme', template=TEMPLATE,
        paper_bgcolor=PAPER_BG, plot_bgcolor=PLOT_BG,
        xaxis=dict(range=[0, 115], title='Recurrence Rate (%)'),
        margin=dict(l=10, r=130, t=50, b=40), height=360,
    )
    return fig

def heatmap():
    heat = df.groupby(['theme', 'severity']).size().unstack(fill_value=0)
    sev_order = [s for s in ['Blocker', 'Critical', 'High', 'Various'] if s in heat.columns]
    heat = heat[sev_order]
    fig = go.Figure(go.Heatmap(
        z=heat.values, x=sev_order, y=heat.index.tolist(),
        colorscale='YlOrRd', showscale=True,
        text=heat.values, texttemplate='%{text}',
        hovertemplate='<b>%{y}</b> — %{x}<br>%{z} incidents<extra></extra>',
    ))
    fig.update_layout(
        title='Theme × Severity Heatmap', template=TEMPLATE,
        paper_bgcolor=PAPER_BG, plot_bgcolor=PLOT_BG,
        margin=dict(l=10, r=10, t=50, b=40), height=380,
    )
    return fig

def year_over_year():
    # Pivot so every year has a value for every theme (0 where absent)
    pivot = df.groupby(['year', 'theme']).size().unstack(fill_value=0)
    themes_ordered = df.groupby('theme').size().sort_values(ascending=False).index.tolist()
    years = [str(y) for y in pivot.index.tolist()]

    fig = go.Figure()
    for theme in themes_ordered:
        vals = pivot[theme].tolist() if theme in pivot.columns else [0] * len(years)
        fig.add_trace(go.Bar(
            x=years, y=vals,
            name=theme, marker_color=THEME_COLORS.get(theme, '#95A5A6'),
            hovertemplate=f'<b>{theme}</b><br>%{{x}}: %{{y}} incidents<extra></extra>',
        ))

    # Total labels above each bar group
    totals = df.groupby('year').size()
    for yr, tot in totals.items():
        fig.add_annotation(x=str(yr), y=tot + 0.4, text=f"<b>{tot}</b>",
                           showarrow=False, font_color='#E0E0E0', font_size=15)

    fig.update_layout(
        barmode='stack', title='Year-over-Year Incidents by Theme',
        template=TEMPLATE, paper_bgcolor=PAPER_BG, plot_bgcolor=PLOT_BG,
        xaxis_title='Year', yaxis_title='Incidents',
        xaxis=dict(type='category'),
        legend=dict(orientation='h', y=-0.25, x=0),
        margin=dict(l=10, r=10, t=50, b=100), height=420,
    )
    return fig

def cumulative_chart():
    ds = df.sort_values('date').copy()
    ds['cumulative'] = range(1, len(ds) + 1)
    fig = go.Figure(go.Scatter(
        x=ds['date'], y=ds['cumulative'],
        mode='lines', line=dict(color='#27AE60', width=2),
        fill='tozeroy', fillcolor='rgba(39,174,96,0.15)',
        hovertemplate='%{x|%b %d, %Y}<br>Cumulative: <b>%{y}</b><extra></extra>',
    ))
    fig.add_vline(x=datetime(2025, 1, 1).timestamp() * 1000,
                  line_dash='dash', line_color='#E74C3C', opacity=0.5,
                  annotation_text='2025', annotation_font_color='#E74C3C')
    fig.update_layout(
        title='Cumulative Incident Growth', template=TEMPLATE,
        paper_bgcolor=PAPER_BG, plot_bgcolor=PLOT_BG,
        xaxis_title='', yaxis_title='Cumulative Incidents',
        margin=dict(l=10, r=10, t=50, b=40), height=300,
    )
    return fig

def incident_table_html():
    """Returns a plain HTML table so Jira ticket links are fully clickable."""
    SEV_EMOJI  = {'Blocker': '🔴', 'Critical': '🟠', 'High': '🟡', 'Various': '⚪'}
    SEV_BG     = {'Blocker': '#2D0A0A', 'Critical': '#2D1A0A', 'High': '#1A1A0D', 'Various': PLOT_BG}
    JIRA_BASE  = 'https://roku.atlassian.net/browse/'

    rows = []
    for _, r in df.sort_values('date').iterrows():
        ticket_html = (
            f'<a href="{JIRA_BASE}{r["ticket"]}" target="_blank" '
            f'style="color:#58A6FF;text-decoration:none">{r["ticket"]}</a>'
            if r['ticket'] else ''
        )
        theme_color = THEME_COLORS.get(r['theme'], '#95A5A6')
        bg = SEV_BG.get(r['severity'], PLOT_BG)
        rows.append(f"""
          <tr style="background:{bg}">
            <td style="color:#8B949E">{int(r['id'])}</td>
            <td style="white-space:nowrap">{r['date'].strftime('%Y-%m-%d')}</td>
            <td style="color:{theme_color};white-space:nowrap">{r['theme']}</td>
            <td style="white-space:nowrap">{SEV_EMOJI.get(r['severity'],'')} {r['severity']}</td>
            <td style="white-space:nowrap">{r['devices']}</td>
            <td style="white-space:nowrap">{ticket_html}</td>
            <td>{r['summary']}</td>
            <td style="text-align:center">{'⛔' if r['blocker'] else ''}</td>
            <td style="text-align:center">{'🔁' if r['recur'] else ''}</td>
          </tr>""")

    return f"""
<div style="overflow-x:auto">
<table style="width:100%;border-collapse:collapse;font-size:0.82rem;color:#C0C8D4">
  <thead>
    <tr style="background:#21262D;color:#E0E0E0;text-align:left">
      <th style="padding:10px 8px">#</th>
      <th style="padding:10px 8px">Date</th>
      <th style="padding:10px 8px">Theme</th>
      <th style="padding:10px 8px">Severity</th>
      <th style="padding:10px 8px">Devices</th>
      <th style="padding:10px 8px">Ticket</th>
      <th style="padding:10px 8px">Summary</th>
      <th style="padding:10px 8px">B</th>
      <th style="padding:10px 8px">R</th>
    </tr>
  </thead>
  <tbody>
    {''.join(rows)}
  </tbody>
</table>
</div>"""

# ── Render charts to HTML strings ─────────────────────────────────────────────
def to_div(fig, include_js=False):
    return fig.to_html(full_html=False, include_plotlyjs='cdn' if include_js else False,
                       config={'displayModeBar': False})

fig_theme    = to_div(incidents_by_theme(), include_js=True)
fig_timeline = to_div(monthly_timeline())
fig_q_stack  = to_div(quarterly_stacked())
fig_sev      = to_div(severity_donut())
fig_device   = to_div(device_chart())
fig_recur    = to_div(recurrence_chart())
fig_heat     = to_div(heatmap())
fig_yoy      = to_div(year_over_year())
fig_cumul    = to_div(cumulative_chart())
fig_table    = incident_table_html()   # plain HTML table — supports clickable Jira links

# ── HTML template ──────────────────────────────────────────────────────────────
html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FrndlyTV / YuppTV — RCA Dashboard</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: #0D1117; color: #E0E0E0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }}
  header {{ background: #161B22; border-bottom: 1px solid #30363D; padding: 18px 32px; display: flex; align-items: center; gap: 16px; }}
  header h1 {{ font-size: 1.3rem; font-weight: 600; color: #F0F6FF; }}
  header p  {{ font-size: 0.8rem; color: #8B949E; margin-top: 2px; }}
  .kpi-row  {{ display: flex; gap: 16px; padding: 20px 32px 0; flex-wrap: wrap; }}
  .kpi      {{ background: #161B22; border: 1px solid #30363D; border-radius: 10px; padding: 18px 26px; flex: 1; min-width: 140px; }}
  .kpi .val {{ font-size: 2.2rem; font-weight: 700; line-height: 1; }}
  .kpi .lbl {{ font-size: 0.75rem; color: #8B949E; margin-top: 4px; text-transform: uppercase; letter-spacing: .05em; }}
  .kpi.red  .val {{ color: #F85149; }}
  .kpi.orange .val {{ color: #E67E22; }}
  .kpi.green  .val {{ color: #3FB950; }}
  .kpi.blue   .val {{ color: #58A6FF; }}
  .section  {{ padding: 24px 32px; }}
  .section h2 {{ font-size: 0.85rem; color: #8B949E; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 14px; }}
  .grid-2   {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
  .grid-3   {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }}
  .card     {{ background: #161B22; border: 1px solid #30363D; border-radius: 10px; padding: 4px; overflow: hidden; }}
  .card.full {{ grid-column: 1 / -1; }}
  .insight  {{ background: #161B22; border: 1px solid #30363D; border-radius: 10px; padding: 20px 24px; }}
  .insight h3 {{ font-size: 0.95rem; font-weight: 600; color: #F0F6FF; margin-bottom: 10px; }}
  .insight ul {{ padding-left: 18px; }}
  .insight li {{ font-size: 0.85rem; color: #C0C8D4; line-height: 1.7; }}
  .insight li span {{ color: #F85149; font-weight: 600; }}
  .tag-blocker {{ background: rgba(248,81,73,0.15); color: #F85149; border-radius: 4px; padding: 1px 6px; font-size: 0.75rem; }}
  .tag-recur   {{ background: rgba(88,166,255,0.15); color: #58A6FF; border-radius: 4px; padding: 1px 6px; font-size: 0.75rem; }}
  footer {{ text-align: center; padding: 24px; font-size: 0.75rem; color: #484F58; border-top: 1px solid #21262D; margin-top: 16px; }}
  @media (max-width: 768px) {{ .grid-2, .grid-3 {{ grid-template-columns: 1fr; }} .kpi-row {{ gap: 10px; }} }}
</style>
</head>
<body>

<header>
  <div>
    <h1>📺 FrndlyTV / YuppTV — RCA Dashboard</h1>
    <p>Root Cause Analysis Repository &nbsp;·&nbsp; Dec 2023 – Dec 2025 &nbsp;·&nbsp; Owner: Chelsea Taylor &nbsp;·&nbsp; Last updated: {last_updated}</p>
  </div>
</header>

<!-- KPIs -->
<div class="kpi-row">
  <div class="kpi blue">  <div class="val">{total}</div>    <div class="lbl">Total Incidents</div></div>
  <div class="kpi red">   <div class="val">{blockers}</div>  <div class="lbl">Blockers</div></div>
  <div class="kpi orange"><div class="val">{recurring}</div> <div class="lbl">Recurring</div></div>
  <div class="kpi">       <div class="val">15</div>          <div class="lbl">Live Feed Incidents</div></div>
  <div class="kpi">       <div class="val">37.5%</div>       <div class="lbl">Feed Drop Share</div></div>
  <div class="kpi green"> <div class="val">{themes}</div>    <div class="lbl">Themes Tracked</div></div>
</div>

<!-- Overview charts -->
<div class="section">
  <h2>Overview</h2>
  <div class="grid-2">
    <div class="card">{fig_theme}</div>
    <div class="card">{fig_sev}</div>
  </div>
</div>

<!-- Timeline -->
<div class="section">
  <h2>Timeline</h2>
  <div class="card full">{fig_timeline}</div>
  <div style="height:16px"></div>
  <div class="card full">{fig_q_stack}</div>
</div>

<!-- Deep dives -->
<div class="section">
  <h2>Deep Dives</h2>
  <div class="grid-3">
    <div class="card">{fig_device}</div>
    <div class="card">{fig_recur}</div>
    <div class="card">{fig_heat}</div>
  </div>
</div>

<!-- Year / Cumulative -->
<div class="section">
  <h2>Trends</h2>
  <div class="grid-2">
    <div class="card">{fig_yoy}</div>
    <div class="card">{fig_cumul}</div>
  </div>
</div>

<!-- Insights -->
<div class="section">
  <h2>Analysis &amp; Recommendations</h2>
  <div class="grid-2">
    <div class="insight">
      <h3>🔍 Key Trends</h3>
      <ul>
        <li><span>Live Feed drops = 37.5%</span> of all incidents. Weigel (4×), MeTV group (3×), and low-bitrate feeds are repeat offenders.</li>
        <li><span>Sept 2024</span> was the worst month: 5 incidents in 6 days — all live feed related.</li>
        <li>Release days are high-risk: <span>3 of 7 App Crash incidents</span> are release-day regressions (Vizio, Roku, Multi-platform).</li>
        <li>Monitoring is reactive: SSL cert, ad zeros, EPG staleness, and feed drops all discovered by users before any alert fired.</li>
        <li>Third-party deps caused 6+ incidents: Bitmovin SDK, Akamai CDN, Gracenote, TiVo integration.</li>
      </ul>
    </div>
    <div class="insight">
      <h3>⚠️ Device Risk</h3>
      <ul>
        <li><span>Vizio</span> appears in 3 separate themes (App Crashes, EPG/CMS, Search) — highest cross-theme risk platform.</li>
        <li><span>Samsung</span> issues are SDK-driven (Bitmovin v8.228) — controllable with version pinning.</li>
        <li><span>25 of 40 incidents</span> affect all platforms simultaneously — these are backend/feed issues, not device bugs.</li>
        <li>Fire TV, Roku, and iOS each have 1 device-specific incident — manageable with platform regression gates.</li>
      </ul>
    </div>
    <div class="insight">
      <h3>🛠️ Top 5 Improvements</h3>
      <ul>
        <li><span>#1</span> Deploy automated feed bitrate + drop alerting for all live channels.</li>
        <li><span>#2</span> Enforce mandatory device-matrix smoke test gate before every release.</li>
        <li><span>#3</span> Build single monitoring dashboard: feeds, ads, EPG freshness, SSL, search index.</li>
        <li><span>#4</span> Pin third-party SDK versions; require staging validation before any upgrade ships.</li>
        <li><span>#5</span> Standardize RCA template with 48-hour SLA for Blocker incidents.</li>
      </ul>
    </div>
    <div class="insight">
      <h3>📋 Infrastructure Risk</h3>
      <ul>
        <li><span>100% Blocker rate</span> — all 3 infrastructure incidents were Blockers. Highest severity theme.</li>
        <li>SSL cert propagated to India but not US — caused 80-minute outage. Multi-region validation checklist needed.</li>
        <li>DB upgrade triggered platform-wide logout. Change management process needed for infra changes.</li>
        <li>No Akamai alerting in place when CDN disrupted 4 platforms simultaneously (July 2025).</li>
      </ul>
    </div>
  </div>
</div>

<!-- Full incident table -->
<div class="section">
  <h2>All Incidents &nbsp;<span class="tag-blocker">⛔ Blocker</span> &nbsp;<span class="tag-recur">🔁 Recurring</span></h2>
  <div class="card full" style="padding:12px">{fig_table}</div>
</div>

<footer>FrndlyTV / YuppTV RCA Dashboard &nbsp;·&nbsp; Generated {last_updated} &nbsp;·&nbsp; <a href="https://roku.atlassian.net/wiki/spaces/FPM/pages/1149815420" style="color:#58A6FF">View source in Confluence</a></footer>

</body>
</html>"""

os.makedirs('docs', exist_ok=True)
out = 'docs/index.html'
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)

print(f"\n✅  Dashboard written to {out}")
print(f"    Size: {os.path.getsize(out) / 1024:.0f} KB")
print(f"\nTo publish:")
print("    git add docs/index.html && git commit -m 'Update RCA dashboard' && git push")
print("\nTo add a new incident:")
print("    Edit the `incidents` list in rca_dashboard.py, then rerun.\n")
