---
name: excalidraw-diagram
description: "Create Excalidraw diagram JSON that makes visual arguments. Use when the user wants to visualize workflows, architectures, or concepts."
---

# Excalidraw Diagram Creator

Generate Excalidraw JSON that **argues visually**, not just displays information.

> **Output the complete Excalidraw JSON in a code block. The client will render it.**

## Customization

**All colors and brand-specific styles live in one file:** `references/color-palette.md`. Use it as the single source of truth for all color choices — shape fills, strokes, text colors, evidence artifact backgrounds, everything.

To produce diagrams in your own brand style, edit `color-palette.md`. Everything else in this file is universal design methodology and Excalidraw best practices.

---

## Core Philosophy

**Diagrams should ARGUE, not DISPLAY.**

A diagram isn't formatted text. It's a visual argument that shows relationships, causality, and flow that words alone can't express. The shape should BE the meaning.

**The Isomorphism Test**: If you removed all text, would the structure alone communicate the concept? If not, redesign.

**The Education Test**: Could someone learn something concrete from this diagram, or does it just label boxes? A good diagram teaches — it shows actual formats, real event names, concrete examples.

---

## Depth Assessment (Do This First)

Before designing, determine what level of detail this diagram needs:

### Simple/Conceptual Diagrams
Use abstract shapes when:
- Explaining a mental model or philosophy
- The audience doesn't need technical specifics
- The concept IS the abstraction (e.g., "separation of concerns")

### Comprehensive/Technical Diagrams
Use concrete examples when:
- Diagramming a real system, protocol, or architecture
- The diagram will be used to teach or explain
- The audience needs to understand what things actually look like
- You're showing how multiple technologies integrate

**For technical diagrams, you MUST include evidence artifacts** (see below).

---

## Research Mandate (For Technical Diagrams)

**Before drawing anything technical, research the actual specifications.**

If you're diagramming a protocol, API, or framework:
1. Look up the actual JSON/data formats
2. Find the real event names, method names, or API endpoints
3. Understand how the pieces actually connect
4. Use real terminology, not generic placeholders

Bad: "Protocol" → "Frontend"
Good: "AG-UI streams events (RUN_STARTED, STATE_DELTA)" → "CopilotKit renders via createA2UIMessageRenderer()"

---

## Evidence Artifacts

Evidence artifacts are concrete examples that prove your diagram is accurate and help viewers learn. Include them in technical diagrams.

| Artifact Type | When to Use | How to Render |
|---------------|-------------|---------------|
| **Code snippets** | APIs, integrations | Dark rectangle + syntax-colored text |
| **Data/JSON examples** | Data formats, schemas | Dark rectangle + colored text |
| **Event/step sequences** | Protocols, workflows | Timeline pattern (line + dots + labels) |
| **UI mockups** | Showing actual output | Nested rectangles mimicking real UI |
| **Real input content** | Showing what goes IN | Rectangle with sample content visible |
| **API/method names** | Real function calls | Use actual names from docs, not placeholders |

---

## Multi-Zoom Architecture

Comprehensive diagrams operate at multiple zoom levels simultaneously:

### Level 1: Summary Flow
Simplified overview showing the full pipeline at a glance.

### Level 2: Section Boundaries
Labeled regions that group related components.

### Level 3: Detail Inside Sections
Evidence artifacts, code snippets, and concrete examples within each section.

**For comprehensive diagrams, aim to include all three levels.**

---

## Design Process

### Step 0: Assess Depth Required
Determine if this needs to be simple/conceptual or comprehensive/technical.

### Step 1: Understand Deeply
For each concept, ask: What does it DO? What relationships exist? What's the core flow?

### Step 2: Map Concepts to Patterns
| If the concept... | Use this pattern |
|-------------------|------------------|
| Spawns multiple outputs | **Fan-out** (radial arrows from center) |
| Combines inputs into one | **Convergence** (funnel, arrows merging) |
| Has hierarchy/nesting | **Tree** (lines + free-floating text) |
| Is a sequence of steps | **Timeline** (line + dots + labels) |
| Loops or improves | **Spiral/Cycle** (arrow returning to start) |
| Is an abstract state | **Cloud** (overlapping ellipses) |
| Transforms input to output | **Assembly line** (before → process → after) |
| Compares two things | **Side-by-side** (parallel with contrast) |
| Separates into phases | **Gap/Break** (visual separation) |

### Step 3: Ensure Variety
Each major concept must use a different visual pattern. No uniform cards or grids.

### Step 4: Sketch the Flow
Mentally trace how the eye moves through the diagram. There should be a clear visual story.

### Step 5: Generate JSON
Create the Excalidraw elements following the structure and templates below.

---

## Container vs. Free-Floating Text

**Not every piece of text needs a shape around it.** Default to free-floating text. Add containers only when they serve a purpose.

| Use a Container When... | Use Free-Floating Text When... |
|------------------------|-------------------------------|
| It's the focal point of a section | It's a label or description |
| It needs visual grouping | It's supporting detail |
| Arrows need to connect to it | It describes something nearby |
| The shape carries meaning | Typography alone creates hierarchy |

**The container test**: For each boxed element, ask "Would this work as free-floating text?" If yes, remove the container. Aim for <30% of text elements inside containers.

---

## Visual Pattern Library

### Fan-Out (One-to-Many)
Central element with arrows radiating to multiple targets.

### Convergence (Many-to-One)
Multiple inputs merging through arrows to single output.

### Tree (Hierarchy)
Parent-child branching with connecting lines and free-floating text (no boxes needed).

### Spiral/Cycle (Continuous Loop)
Elements in sequence with arrow returning to start.

### Timeline
Vertical or horizontal line with small dots (10-20px ellipses) at intervals, free-floating labels beside each dot.

### Lines as Structure
Use lines (type: `line`, not arrows) as primary structural elements:
- Timelines, tree structures, dividers, flow spines
- Lines + free-floating text often creates cleaner results than boxes + contained text

---

## Shape Meaning

| Concept Type | Shape | Why |
|--------------|-------|-----|
| Labels, descriptions | **none** (free-floating text) | Typography creates hierarchy |
| Markers on a timeline | small `ellipse` (10-20px) | Visual anchor |
| Start, trigger, input | `ellipse` | Soft, origin-like |
| End, output, result | `ellipse` | Completion |
| Decision, condition | `diamond` | Classic decision symbol |
| Process, action, step | `rectangle` | Contained action |
| Abstract state | overlapping `ellipse` | Fuzzy, cloud-like |

---

## Color as Meaning

Colors encode information, not decoration. Every color choice should come from `references/color-palette.md`. Each semantic purpose has a specific fill/stroke pair. Do not invent new colors.

---

## Modern Aesthetics

- `roughness: 0` — Clean, crisp edges (default for professional use)
- `strokeWidth: 2` — Standard for shapes and primary arrows
- `opacity: 100` — Always for all elements
- Small dots (10-20px ellipses) as timeline markers, bullet points, connection nodes

---

## Layout Principles

- **Hero**: 300×150 — visual anchor, most important
- **Primary**: 180×90
- **Secondary**: 120×60
- **Small**: 60×40
- Most important element has the most empty space around it (200px+)
- Guide the eye: left→right or top→bottom for sequences, radial for hub-and-spoke
- If A relates to B, there must be an arrow

---

## Text Rules

**CRITICAL**: The JSON `text` property contains ONLY readable words.

```json
{
  "id": "myElement1",
  "text": "Start",
  "originalText": "Start"
}
```

Settings: `fontSize: 16`, `fontFamily: 3`, `textAlign: "center"`, `verticalAlign: "middle"`

---

## JSON Structure

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [...],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": 20
  },
  "files": {}
}
```

See `references/element-templates.md` for copy-paste JSON templates for each element type. Pull colors from `references/color-palette.md`.

---

## Large Diagram Strategy

**For comprehensive diagrams, build the JSON one section at a time.** Do NOT attempt to generate the entire file in a single pass.

1. Create the base file with JSON wrapper and first section of elements
2. Add one section per edit — think carefully about layout and spacing
3. Use descriptive string IDs (e.g., `"trigger_rect"`, `"arrow_fan_left"`)
4. Namespace seeds by section (section 1 uses 100xxx, section 2 uses 200xxx)
5. Update cross-section bindings as you go

---

## Quality Checklist

### Depth & Evidence
1. Research done for technical diagrams
2. Evidence artifacts included (code snippets, JSON examples, real data)
3. Multi-zoom levels present
4. Concrete over abstract — real content shown

### Conceptual
5. Isomorphism — visual structure mirrors concept behavior
6. Variety — each major concept uses a different pattern
7. No uniform containers — avoided card grids

### Container Discipline
8. Minimal containers — <30% of text in boxes
9. Lines as structure for trees/timelines
10. Typography hierarchy via font size and color

### Structural
11. Every relationship has an arrow or line
12. Clear visual flow path
13. Important elements are larger/more isolated

### Technical
14. `text` contains only readable words
15. `fontFamily: 3`, `roughness: 0`, `opacity: 100`
