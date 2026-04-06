# Confidence Report HTML Template

**Purpose:** Parameterized HTML template for generating interactive confidence reports alongside the gap analysis markdown.

---

## Data Contract

Before populating this template, the skill must have computed all of the following from Steps 6-8:

| Field | Source | Example |
|-------|--------|---------|
| `CLIENT_NAME` | BRD / intake | "Changi Airport Group" |
| `PROGRAM_NAME` | BRD / intake | "Changi Rewards" |
| `GEOGRAPHY` | BRD / intake | "Singapore \| APAC" |
| `TIER_TYPE` | BRD analysis | "Multi-tier" or "Single-tier" |
| `REPORT_DATE` | Today's date | "March 31, 2026" |
| `SOURCE_DOCS` | Input documents | "BRD v2.0 + SDD v1.1" |
| `CLIENT_PRIMARY` | Auto-detect from client brand | "#00653E" (hex color) |
| `CLIENT_DARK` | Darker variant of primary | "#004d2e" (hex color) |
| `OVERALL_RMS` | Step 7 P/R/O | "~76%" |
| `RAW_RMS` | Step 7 weighted raw | "84.2% raw, adjusted for risk flags" |
| `DELIVERY_CONFIDENCE` | Step 6 aggregate DCS | "Medium" or "Med-High" or "High" |
| `DELIVERY_CONFIDENCE_COLOR` | Based on DCS level | "var(--yellow)" for Med, "var(--green)" for High |
| `SDD_CONFIDENCE_SCORE` | Computed from verification pass rate × DCS | "72/100" |
| `OPEN_YELLOW_GAPS` | Count from Step 8 | "4" |
| `OPEN_QUESTIONS_COUNT` | Count from Step 8 | "15" |
| `EXEC_NOTE` | Executive summary narrative from gap analysis | HTML paragraph text |
| `DOMAIN_CARDS[]` | Array of 15 domain objects (see Domain Card Contract below) |
| `SCORECARD_ROWS[]` | Array of 15 rows sorted by RMS ascending |
| `GAP_CARDS[]` | Array of critical/resolved gaps |
| `TBC_CARDS[]` | Array of scope-TBC items (optional, from SDD review) |
| `WISHLIST_ROWS[]` | Array of wishlist items (optional, if wishlist doc provided) |
| `OPEN_QUESTIONS[]` | Array of open question strings |

### Domain Card Contract

Each domain object requires:

| Field | Example |
|-------|---------|
| `id` | "d1" |
| `num` | "1" |
| `name` | "Customer Profiles" |
| `rms_pct` | 95 (integer) |
| `rms_color_class` | "rms-80" (≥80), "rms-70" (60-79), "rms-60" (40-59), "rms-50" (<40) |
| `rms_color` | "#16a34a" (green ≥80), "#ca8a04" (yellow 60-79), "#ea580c" (orange 40-59), "#dc2626" (red <40) |
| `dcs` | "High" / "Medium" / "Low" |
| `dcs_class` | "badge-high" / "badge-med" / "badge-low" |
| `requirements_html` | Full HTML for the requirements table inside the domain body |
| `gaps_html` | HTML for gap items (or empty string if no gaps) |
| `notes_html` | Optional additional notes HTML (e.g., tier logic mapping notes) |

### RMS Color Rules

```
rms >= 80 → class: "rms-80", color: "#16a34a" (green)
60 <= rms < 80 → class: "rms-70", color: "#ca8a04" (yellow)
40 <= rms < 60 → class: "rms-60", color: "#ea580c" (orange)
rms < 40 → class: "rms-50", color: "#dc2626" (red)
```

### Client Brand Color Selection

Auto-detect based on client identity. Known mappings:
- **RWS**: primary `#0d6e3f`, dark `#074a2a`
- **Changi Airport**: primary `#00653E`, dark `#004d2e`
- **Italo**: primary `#cc0000`, dark `#8b0000`
- **Jollibee**: primary `#e31837`, dark `#a01228`

For unknown clients, use Capillary default: primary `#1a56db`, dark `#0f3a8a`.

---

## HTML Template

Generate the following HTML, replacing all `{{PLACEHOLDER}}` values with computed data. For array sections (domain cards, scorecard rows, gaps, wishlist, questions), repeat the inner HTML block for each item.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{CLIENT_NAME}} {{PROGRAM_NAME}} → Capillary Confidence Report</title>
  <style>
    :root {
      --client-primary: {{CLIENT_PRIMARY}};
      --client-dark:    {{CLIENT_DARK}};
      --cap-blue:     #1a56db;
      --cap-light:    #e8f0fe;
      --green:        #15803d;
      --green-bg:     #dcfce7;
      --yellow:       #92400e;
      --yellow-bg:    #fef9c3;
      --red:          #991b1b;
      --red-bg:       #fee2e2;
      --grey:         #6b7280;
      --grey-bg:      #f3f4f6;
      --border:       #e5e7eb;
      --text:         #111827;
      --text-muted:   #6b7280;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: var(--text);
      background: #f8fafc;
      line-height: 1.6;
    }

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, var(--client-dark) 0%, var(--client-primary) 100%);
      color: white;
      padding: 40px 48px 32px;
    }
    .header-logo { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; opacity: .7; margin-bottom: 8px; }
    .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 6px; }
    .header-sub { font-size: 13px; opacity: .8; }
    .header-meta { margin-top: 20px; display: flex; gap: 32px; flex-wrap: wrap; }
    .header-meta span { font-size: 12px; opacity: .85; }
    .header-meta strong { opacity: 1; }

    /* ── Layout ── */
    .page { max-width: 1100px; margin: 0 auto; padding: 32px 24px 64px; }

    /* ── Section titles ── */
    .section-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--client-dark);
      margin: 40px 0 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--client-primary);
    }

    /* ── Executive summary cards ── */
    .exec-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .exec-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 16px;
      text-align: center;
    }
    .exec-card .val {
      font-size: 32px;
      font-weight: 800;
      color: var(--client-primary);
      line-height: 1.1;
    }
    .exec-card .lbl {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 600;
      margin-top: 8px;
      line-height: 1.4;
    }
    .exec-note {
      background: var(--cap-light);
      border: 1px solid #bbd4fe;
      border-radius: 10px;
      padding: 16px 20px;
      font-size: 13px;
      line-height: 1.7;
      margin-bottom: 8px;
    }

    /* ── Scoring legend ── */
    .legend-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 8px; }
    .legend-box {
      background: white;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 20px;
    }
    .legend-box h4 { font-size: 13px; margin-bottom: 10px; color: var(--client-dark); }
    .legend-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; font-size: 12px; }
    .legend-bar { height: 8px; border-radius: 4px; }

    /* ── DCS badges ── */
    .badge-dcs {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 10px;
      border-radius: 20px;
      white-space: nowrap;
    }
    .badge-high { background: var(--green-bg); color: var(--green); }
    .badge-med  { background: var(--yellow-bg); color: var(--yellow); }
    .badge-low  { background: var(--red-bg); color: var(--red); }

    /* ── Domain cards ── */
    .domain-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .domain-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 20px;
      cursor: pointer;
      user-select: none;
    }
    .domain-header:hover { background: #f9fafb; }
    .domain-title-row { display: flex; align-items: center; gap: 12px; }
    .domain-num {
      min-width: 28px; height: 28px;
      background: var(--client-primary);
      color: white;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700;
    }
    .domain-name { font-size: 15px; font-weight: 700; }
    .domain-badges { display: flex; align-items: center; gap: 12px; }
    .rms-wrap { display: flex; align-items: center; gap: 6px; }
    .rms-label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
    .rms-bar-track {
      width: 80px; height: 7px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }
    .rms-bar-fill { height: 100%; border-radius: 4px; }
    .rms-val { font-size: 14px; font-weight: 800; min-width: 36px; }
    .chevron {
      font-size: 12px;
      transition: transform .2s;
      color: var(--text-muted);
    }
    .domain-card.open .chevron { transform: rotate(180deg); }
    .domain-body {
      display: none;
      padding: 0 20px 20px;
    }
    .domain-card.open .domain-body { display: block; }
    .domain-section { margin-bottom: 16px; }
    .domain-section h4 {
      font-size: 13px;
      font-weight: 700;
      color: var(--client-dark);
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--border);
    }
    .domain-section ul { padding-left: 20px; }
    .domain-section li { font-size: 13px; margin-bottom: 4px; }
    .domain-section code {
      background: #f1f5f9;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 12px;
    }

    /* ── Requirement tables inside domain bodies ── */
    .req-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-bottom: 12px;
    }
    .req-table th {
      background: var(--grey-bg);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .3px;
      padding: 8px 12px;
      text-align: left;
      border-bottom: 2px solid var(--border);
    }
    .req-table td {
      padding: 7px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .req-table tr:last-child td { border-bottom: none; }
    .req-table tr:nth-child(even) td { background: #fafafa; }

    /* ── Gap items inside domain bodies ── */
    .gap-item {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      margin-bottom: 8px;
      line-height: 1.6;
    }
    .gap-item.resolved {
      background: #f0fdf4;
      border-color: #16a34a;
    }
    .confirm-tag {
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #f59e0b;
      font-size: 10.5px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
      margin-left: 4px;
    }

    /* ── Scorecard table ── */
    .scorecard-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .scorecard-table th {
      background: var(--client-dark);
      color: white;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .5px;
      padding: 12px 16px;
      text-align: left;
    }
    .scorecard-table td {
      padding: 11px 16px;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    .scorecard-table tr:last-child td { border-bottom: none; }
    .scorecard-table tr:nth-child(even) td { background: #fafafa; }
    .scorecard-table tr.total td {
      background: #f0f4ff;
      font-weight: 700;
      border-top: 2px solid var(--client-primary);
    }
    .tbl-bar-track {
      width: 80px; height: 7px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      display: inline-block;
      vertical-align: middle;
      margin-right: 6px;
    }
    .tbl-bar-fill { height: 100%; border-radius: 4px; }

    /* ── Critical Gaps ── */
    .gap-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 16px;
      border-left: 5px solid #f59e0b;
    }
    .gap-card.critical { border-color: var(--red); }
    .gap-card h3 {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .gap-card .severity {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 20px;
    }
    .sev-red    { background: var(--red-bg);    color: var(--red); }
    .sev-yellow { background: var(--yellow-bg); color: var(--yellow); }
    .sev-green  { background: var(--green-bg);  color: var(--green); }
    .badge-tbc  { background: #f3e8ff; color: #5a189a; }
    .gap-card.resolved { border-left-color: #16a34a; background: #f0fdf4; }
    .gap-card p  { font-size: 13px; line-height: 1.7; margin-bottom: 8px; }
    .gap-card .rec {
      background: #f0fdf4;
      border-left: 3px solid var(--green);
      padding: 8px 12px;
      font-size: 13px;
      border-radius: 0 6px 6px 0;
    }
    .gap-card .rec strong { color: var(--green); }

    /* ── Wishlist table ── */
    .wishlist-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    .wishlist-table th {
      background: var(--client-dark);
      color: white;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .5px;
      padding: 12px 16px;
      text-align: left;
    }
    .wishlist-table td {
      padding: 11px 16px;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .wishlist-table tr:last-child td { border-bottom: none; }
    .wishlist-table tr:nth-child(even) td { background: #fafafa; }
    .match-yes     { display: inline-block; background: var(--green-bg); color: var(--green); font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 20px; }
    .match-partial { display: inline-block; background: var(--yellow-bg); color: var(--yellow); font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 20px; }
    .match-no      { display: inline-block; background: var(--red-bg); color: var(--red); font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 20px; }
    .match-verify  { display: inline-block; background: var(--grey-bg); color: var(--grey); font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 20px; }

    /* ── Questions ── */
    .questions-list { background: white; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .q-item {
      display: flex;
      gap: 14px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      line-height: 1.6;
      align-items: flex-start;
    }
    .q-item:last-child { border-bottom: none; }
    .q-num {
      min-width: 24px; height: 24px;
      background: var(--cap-blue);
      color: white;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; flex-shrink: 0;
      margin-top: 1px;
    }
    .q-text strong { color: var(--client-dark); }
    .q-item.resolved { background: #f0fdf4; }
    .q-item.resolved .q-num { background: #16a34a; }

    /* ── Footer ── */
    .footer {
      text-align: center;
      font-size: 11px;
      color: var(--text-muted);
      padding-top: 32px;
      border-top: 1px solid var(--border);
      margin-top: 48px;
    }

    /* ── RMS colour helper ── */
    .rms-80 { background: #16a34a; }
    .rms-70 { background: #ca8a04; }
    .rms-60 { background: #ea580c; }
    .rms-50 { background: #dc2626; }

    @media(max-width: 700px) {
      .exec-grid { grid-template-columns: repeat(3, 1fr); }
      .legend-grid { grid-template-columns: 1fr; }
      .header { padding: 24px 20px; }
      .page { padding: 20px 12px 48px; }
      .domain-badges { flex-direction: column; align-items: flex-end; gap: 4px; }
      .rms-bar-track { width: 60px; }
    }
  </style>
</head>
<body>

<!-- ═══════════════ HEADER ═══════════════ -->
<div class="header">
  <div class="header-logo">Internal — Confidential</div>
  <h1>{{CLIENT_NAME}} {{PROGRAM_NAME}} → Capillary Confidence Report</h1>
  <div class="header-sub">{{GEOGRAPHY}} | {{TIER_TYPE}}</div>
  <div class="header-meta">
    <span><strong>Date:</strong> {{REPORT_DATE}}</span>
    <span><strong>Source:</strong> {{SOURCE_DOCS}}</span>
    <span><strong>Skill:</strong> solution-gap-analyzer v1.1</span>
  </div>
</div>

<div class="page">

  <!-- ═══════════════ EXEC SUMMARY ═══════════════ -->
  <div class="section-title">Executive Summary</div>

  <div class="exec-grid">
    <div class="exec-card">
      <div class="val">{{OVERALL_RMS}}</div>
      <div class="lbl">Overall RMS<br><span style="font-size:10px;font-weight:400;color:var(--text-muted)">{{RAW_RMS}}</span></div>
    </div>
    <div class="exec-card">
      <div class="val" style="color:{{DELIVERY_CONFIDENCE_COLOR}}">{{DELIVERY_CONFIDENCE}}</div>
      <div class="lbl">Delivery<br>Confidence</div>
    </div>
    <div class="exec-card">
      <div class="val" style="color:var(--cap-blue)">{{SDD_CONFIDENCE_SCORE}}</div>
      <div class="lbl">SDD Confidence<br>Score</div>
    </div>
    <div class="exec-card">
      <div class="val" style="color:var(--yellow)">{{OPEN_YELLOW_GAPS}}</div>
      <div class="lbl">Open YELLOW<br>Gaps</div>
    </div>
    <div class="exec-card">
      <div class="val" style="color:var(--yellow)">{{OPEN_QUESTIONS_COUNT}}</div>
      <div class="lbl">Open<br>Questions</div>
    </div>
  </div>

  <div class="exec-note">
    {{EXEC_NOTE}}
  </div>

  <!-- ═══════════════ SCORING LEGEND ═══════════════ -->
  <div class="section-title">Scoring Methodology</div>
  <div class="legend-grid">
    <div class="legend-box">
      <h4>Requirement Matching Score (RMS)</h4>
      <div class="legend-row"><div class="legend-bar rms-80" style="width:50px"></div> <span><strong>80-100%</strong> — Out-of-box, well-documented</span></div>
      <div class="legend-row"><div class="legend-bar rms-70" style="width:38px"></div> <span><strong>60-79%</strong> — Mostly native, minor config needed</span></div>
      <div class="legend-row"><div class="legend-bar rms-60" style="width:28px"></div> <span><strong>40-59%</strong> — Partial; workaround or light customisation</span></div>
      <div class="legend-row"><div class="legend-bar rms-50" style="width:18px"></div> <span><strong>0-39%</strong> — Significant custom dev / not supported</span></div>
    </div>
    <div class="legend-box">
      <h4>Delivery Confidence Score (DCS)</h4>
      <div class="legend-row"><span class="badge-dcs badge-high">High</span> <span>Proven, documented API capability — low ambiguity</span></div>
      <div class="legend-row"><span class="badge-dcs badge-med">Medium</span> <span>Likely deliverable; complexity or doc gaps create uncertainty</span></div>
      <div class="legend-row"><span class="badge-dcs badge-low">Low</span> <span>Unclear, undocumented, or requires deep investigation</span></div>
    </div>
  </div>

  <!-- ═══════════════ DOMAIN CARDS ═══════════════ -->
  <div class="section-title">Requirement Domain Analysis</div>
  <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Click any domain to expand the full analysis.</p>

  <!-- REPEAT for each domain in DOMAIN_CARDS[]:

  <div class="domain-card" id="{{domain.id}}">
    <div class="domain-header" onclick="toggle('{{domain.id}}')">
      <div class="domain-title-row">
        <div class="domain-num">{{domain.num}}</div>
        <div class="domain-name">{{domain.name}}</div>
      </div>
      <div class="domain-badges">
        <div class="rms-wrap">
          <span class="rms-label">RMS</span>
          <div class="rms-bar-track"><div class="rms-bar-fill {{domain.rms_color_class}}" style="width:{{domain.rms_pct}}%"></div></div>
          <span class="rms-val" style="color:{{domain.rms_color}}">{{domain.rms_pct}}%</span>
        </div>
        <span class="badge-dcs {{domain.dcs_class}}">{{domain.dcs}}</span>
        <span class="chevron">&#9660;</span>
      </div>
    </div>
    <div class="domain-body">
      <div class="domain-section">
        <h4>Requirements &amp; Capillary Match</h4>
        {{domain.requirements_html}}
      </div>
      {{domain.gaps_html}}
      {{domain.notes_html}}
    </div>
  </div>

  END REPEAT -->

  <!-- ═══════════════ SCORECARD ═══════════════ -->
  <div class="section-title">Summary Scorecard</div>
  <table class="scorecard-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Domain</th>
        <th>RMS</th>
        <th>DCS</th>
        <th>Primary Risk</th>
      </tr>
    </thead>
    <tbody>
      <!-- REPEAT for each row in SCORECARD_ROWS[] (sorted by RMS ascending):

      <tr>
        <td>{{row.num}}</td>
        <td>{{row.name}}</td>
        <td><div class="tbl-bar-track"><div class="tbl-bar-fill {{row.rms_color_class}}" style="width:{{row.rms_pct}}%"></div></div><strong style="color:{{row.rms_color}}">{{row.rms_pct}}%</strong></td>
        <td><span class="badge-dcs {{row.dcs_class}}">{{row.dcs}}</span></td>
        <td style="font-size:12px">{{row.primary_risk}}</td>
      </tr>

      END REPEAT -->

      <!-- Total row: -->
      <tr class="total">
        <td colspan="2">Overall ({{OVERALL_RMS}} adjusted)</td>
        <td><div class="tbl-bar-track"><div class="tbl-bar-fill {{OVERALL_RMS_COLOR_CLASS}}" style="width:{{OVERALL_RMS_PCT}}%"></div></div><strong style="color:{{OVERALL_RMS_COLOR}}">{{OVERALL_RMS}}</strong></td>
        <td><span class="badge-dcs {{OVERALL_DCS_CLASS}}">{{DELIVERY_CONFIDENCE}}</span></td>
        <td style="font-size:12px">{{OVERALL_RISK_SUMMARY}}</td>
      </tr>
    </tbody>
  </table>

  <!-- ═══════════════ CRITICAL GAPS ═══════════════ -->
  <div class="section-title">Critical Gaps &amp; Recommendations</div>

  <!-- REPEAT for each gap in GAP_CARDS[]:

  IF gap.resolved:
  <div class="gap-card resolved">
    <h3><span class="severity sev-green">RESOLVED</span> {{gap.id}} — {{gap.title}}</h3>
    <p><strong>Status:</strong> {{gap.description}}</p>
    <div class="rec"><strong>Resolution:</strong> {{gap.recommendation}}</div>
  </div>

  ELSE IF gap.severity == "RED":
  <div class="gap-card critical">
    <h3><span class="severity sev-red">HIGH</span> {{gap.id}} — {{gap.title}}</h3>
    <p>{{gap.description}}</p>
    <div class="rec"><strong>Recommendation:</strong> {{gap.recommendation}}</div>
  </div>

  ELSE (YELLOW):
  <div class="gap-card">
    <h3><span class="severity sev-yellow">MEDIUM</span> {{gap.id}} — {{gap.title}}</h3>
    <p>{{gap.description}}</p>
    <div class="rec"><strong>Recommendation:</strong> {{gap.recommendation}}</div>
  </div>

  END REPEAT -->

  <!-- ═══════════════ TBC ITEMS (optional) ═══════════════ -->
  <!-- Include this section only if TBC_CARDS[] is non-empty:

  <div class="section-title">Scope TBC Items</div>
  <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">These features were identified but scope needs confirmation with the client.</p>

  REPEAT for each item in TBC_CARDS[]:
  <div class="gap-card">
    <h3><span class="severity badge-tbc">TBC</span> {{item.id}} — {{item.title}}</h3>
    <p>{{item.description}}</p>
    <div class="rec"><strong>Action:</strong> {{item.action}}</div>
  </div>
  END REPEAT -->

  <!-- ═══════════════ WISHLIST (optional) ═══════════════ -->
  <!-- Include this section only if WISHLIST_ROWS[] is non-empty:

  <div class="section-title">Wishlist Items — Capillary Match Assessment</div>
  <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Items beyond the BRD's MVP scope, sourced from the client wishlist document.</p>

  <table class="wishlist-table">
    <thead>
      <tr>
        <th>Wishlist Item</th>
        <th>Match</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      REPEAT for each row in WISHLIST_ROWS[]:
      <tr>
        <td><strong>{{row.item}}</strong></td>
        <td>
          IF row.match == "yes": <span class="match-yes">&#9989; Yes</span>
          ELSE IF row.match == "partial": <span class="match-partial">&#9888; Partial</span>
          ELSE IF row.match == "no": <span class="match-no">&#10007; No</span>
          ELSE: <span class="match-verify">&#63; Verify</span>
        </td>
        <td>{{row.notes}}</td>
      </tr>
      END REPEAT
    </tbody>
  </table>

  END IF WISHLIST -->

  <!-- ═══════════════ OPEN QUESTIONS ═══════════════ -->
  <div class="section-title">Open Questions</div>
  <div class="questions-list">
    <!-- REPEAT for each question in OPEN_QUESTIONS[] (index i starting at 1):

    IF question.resolved:
    <div class="q-item resolved">
      <div class="q-num" style="background:#16a34a">{{i}}</div>
      <div class="q-text">{{question.html}}</div>
    </div>
    ELSE:
    <div class="q-item">
      <div class="q-num">{{i}}</div>
      <div class="q-text">{{question.html}}</div>
    </div>

    END REPEAT -->
  </div>

  <div class="footer">
    {{CLIENT_NAME}} {{PROGRAM_NAME}} → Capillary Confidence Report · {{SOURCE_DOCS}} · {{REPORT_DATE}} · Internal &amp; Confidential
  </div>

</div>

<script>
  function toggle(id) {
    const card = document.getElementById(id);
    card.classList.toggle('open');
  }
</script>
</body>
</html>
```

---

## Assembly Instructions

1. **Collect data** from Steps 6-8 of the gap analysis (all fields in the Data Contract above)
2. **Select brand colors** using the Client Brand Color Selection table
3. **Compute SDD Confidence Score** as: `floor(verification_pass_rate × 0.6 + (domains_with_high_dcs / total_domains × 100) × 0.4)`
4. **Replace all `{{PLACEHOLDER}}`** values with computed data
5. **Expand all REPEAT blocks** — generate one HTML block per array item
6. **Remove all template comments** (lines starting with `<!-- REPEAT`, `<!-- END`, `<!-- IF`, `<!-- Include this section`)
7. **Write** the final HTML to `{output_dir}/{client-slug}-capillary-confidence-report.html`
8. The HTML must be self-contained (no external dependencies) and work when opened directly in a browser
