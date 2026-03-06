import { useState } from "react";

const COLORS = {
  bg: "#0B0F1A",
  card: "#141926",
  cardHover: "#1A2035",
  border: "#1E2740",
  borderActive: "#3B82F6",
  text: "#E2E8F0",
  textMuted: "#64748B",
  textDim: "#475569",
  accent: "#3B82F6",
  accentGlow: "rgba(59, 130, 246, 0.15)",
  green: "#10B981",
  greenGlow: "rgba(16, 185, 129, 0.15)",
  purple: "#8B5CF6",
  purpleGlow: "rgba(139, 92, 246, 0.15)",
  orange: "#F59E0B",
  orangeGlow: "rgba(245, 158, 11, 0.15)",
  cyan: "#06B6D4",
  cyanGlow: "rgba(6, 182, 212, 0.15)",
};

const layers = [
  {
    id: "frontend",
    label: "Frontend",
    subtitle: "React PWA · Mobile-First",
    color: COLORS.accent,
    glow: COLORS.accentGlow,
    icon: "📱",
    items: [
      { name: "Session UI", desc: "Minimal voice-only interface with mic button" },
      { name: "Upload Flow", desc: "Drag-and-drop for PDF, DOCX, PPTX files" },
      { name: "Study Plan View", desc: "Topic outline with mastery indicators" },
      { name: "Auth", desc: "Email/password + Google OAuth" },
    ],
    techs: ["React", "Tailwind CSS", "PWA", "WebSocket"],
  },
  {
    id: "voice",
    label: "Voice Layer",
    subtitle: "ElevenLabs Conversational AI 2.0",
    color: COLORS.green,
    glow: COLORS.greenGlow,
    icon: "🎙️",
    items: [
      { name: "STT (Speech-to-Text)", desc: "Real-time transcription, 32+ languages, academic terminology" },
      { name: "Turn-Taking Model", desc: "Proprietary model for natural pauses, interruptions, hesitations" },
      { name: "TTS (Text-to-Speech)", desc: "Natural human-sounding voice, Flash v2.5 for 75ms latency" },
      { name: "RAG Integration", desc: "Built-in retrieval from processed study materials" },
    ],
    techs: ["ElevenLabs SDK", "WebRTC", "RAG", "Multimodal"],
  },
  {
    id: "brain",
    label: "Tutoring Brain",
    subtitle: "Claude (via ElevenLabs LLM Selection)",
    color: COLORS.purple,
    glow: COLORS.purpleGlow,
    icon: "🧠",
    items: [
      { name: "System Prompt", desc: "Tutor persona, grounding rules, teaching logic, assessment rules" },
      { name: "Socratic Engine", desc: "Teach → check → correct/advance loop with adaptive pacing" },
      { name: "Content Grounding", desc: "Two-layer model: curriculum from materials, teaching from knowledge" },
      { name: "Assessment Logic", desc: "Section quizzes, chapter assessments, professor question detection" },
    ],
    techs: ["Claude Sonnet", "System Prompt", "Two-Layer Grounding"],
  },
  {
    id: "backend",
    label: "Backend & Data",
    subtitle: "Supabase + Serverless Functions",
    color: COLORS.orange,
    glow: COLORS.orangeGlow,
    icon: "🗄️",
    items: [
      { name: "Material Processing", desc: "Parse uploads → structured concepts → lesson plans → RAG index" },
      { name: "Mastery Tracking", desc: "Concept-level state: not started, in progress, struggling, mastered" },
      { name: "Session State", desc: "Auto-save position, context, and progress on every state change" },
      { name: "User & Auth", desc: "Accounts, education level, preferences, file storage" },
    ],
    techs: ["Supabase Postgres", "Supabase Storage", "Edge Functions", "Row-Level Security"],
  },
];

const dataFlows = [
  { from: "frontend", to: "voice", label: "Student speaks", direction: "down" },
  { from: "voice", to: "brain", label: "Transcribed text + material context", direction: "down" },
  { from: "brain", to: "voice", label: "Tutor response text", direction: "up" },
  { from: "voice", to: "frontend", label: "Natural speech audio", direction: "up" },
  { from: "frontend", to: "backend", label: "Upload files, auth, settings", direction: "side" },
  { from: "backend", to: "voice", label: "Processed materials → RAG knowledge base", direction: "side" },
  { from: "brain", to: "backend", label: "Mastery updates, session state", direction: "side" },
  { from: "backend", to: "brain", label: "Lesson plan, student context, mastery state", direction: "side" },
];

function LayerCard({ layer, isActive, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: isActive ? layer.glow : COLORS.card,
        border: `1px solid ${isActive ? layer.color : COLORS.border}`,
        borderRadius: 12,
        padding: "20px 24px",
        cursor: "pointer",
        transition: "all 0.3s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {isActive && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: layer.color,
            borderRadius: "12px 12px 0 0",
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isActive ? 16 : 0 }}>
        <span style={{ fontSize: 28 }}>{layer.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.text, letterSpacing: "-0.01em" }}>
            {layer.label}
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontFamily: "monospace" }}>
            {layer.subtitle}
          </div>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          style={{
            transform: isActive ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s ease",
            opacity: 0.4,
          }}
        >
          <path d="M4 6l4 4 4-4" stroke={COLORS.textMuted} strokeWidth="2" fill="none" />
        </svg>
      </div>

      {isActive && (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {layer.items.map((item, i) => (
              <div
                key={i}
                style={{
                  background: "rgba(0,0,0,0.25)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: layer.color, marginBottom: 3 }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4 }}>{item.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {layer.techs.map((t, i) => (
              <span
                key={i}
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: `${layer.color}15`,
                  color: layer.color,
                  border: `1px solid ${layer.color}30`,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FlowArrow({ color, direction }) {
  const isDown = direction === "down";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "4px 0",
      }}
    >
      <svg width="24" height="20" viewBox="0 0 24 20">
        {isDown ? (
          <>
            <line x1="12" y1="0" x2="12" y2="14" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
            <polygon points="6,12 12,20 18,12" fill={color} opacity="0.7" />
          </>
        ) : (
          <>
            <line x1="6" y1="10" x2="18" y2="10" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
            <polygon points="16,5 24,10 16,15" fill={color} opacity="0.7" />
          </>
        )}
      </svg>
    </div>
  );
}

export default function ArchitectureDiagram() {
  const [activeLayer, setActiveLayer] = useState("voice");
  const [showFlows, setShowFlows] = useState(false);

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100vh",
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
        color: COLORS.text,
        padding: "32px 24px",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div
          style={{
            fontSize: 10,
            fontFamily: "monospace",
            color: COLORS.accent,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          System Architecture
        </div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            margin: "0 0 8px",
            background: `linear-gradient(135deg, ${COLORS.text}, ${COLORS.accent})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Voice AI Tutor
        </h1>
        <p style={{ fontSize: 14, color: COLORS.textMuted, margin: 0, lineHeight: 1.5 }}>
          ElevenLabs Conversational AI + Claude + Supabase
        </p>
        <p style={{ fontSize: 11, color: COLORS.textDim, margin: "4px 0 0", fontFamily: "monospace" }}>
          MVP Architecture · v1.0 · March 2026
        </p>
      </div>

      {/* Main diagram */}
      <div style={{ display: "flex", gap: 24 }}>
        {/* Left: Layer stack */}
        <div style={{ flex: 1 }}>
          {layers.map((layer, i) => (
            <div key={layer.id}>
              <LayerCard
                layer={layer}
                isActive={activeLayer === layer.id}
                onClick={() => setActiveLayer(activeLayer === layer.id ? null : layer.id)}
              />
              {i < layers.length - 1 && <FlowArrow color={layers[i + 1].color} direction="down" />}
            </div>
          ))}
        </div>

        {/* Right: Data flow panel */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <div
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: 20,
              position: "sticky",
              top: 32,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: COLORS.text,
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>⚡</span> Data Flows
            </div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 16 }}>
              How data moves between layers
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dataFlows.map((flow, i) => {
                const fromLayer = layers.find((l) => l.id === flow.from);
                const toLayer = layers.find((l) => l.id === flow.to);
                return (
                  <div
                    key={i}
                    style={{
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      border: `1px solid ${COLORS.border}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: fromLayer.color,
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 10, color: COLORS.textMuted }}>→</span>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: toLayer.color,
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 9, color: COLORS.textDim, fontFamily: "monospace", marginLeft: 4 }}>
                        {fromLayer.label} → {toLayer.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, paddingLeft: 2 }}>{flow.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Real-time loop callout */}
            <div
              style={{
                marginTop: 20,
                background: `${COLORS.cyan}10`,
                border: `1px solid ${COLORS.cyan}30`,
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.cyan, marginBottom: 4 }}>
                ⟳ Real-Time Voice Loop
              </div>
              <div style={{ fontSize: 10, color: COLORS.textDim, lineHeight: 1.5 }}>
                Student speaks → ElevenLabs STT → Claude processes + responds → ElevenLabs TTS → Student hears
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: COLORS.cyan,
                  fontFamily: "monospace",
                  marginTop: 6,
                  fontWeight: 600,
                }}
              >
                Target: &lt; 1.5s round-trip
              </div>
            </div>

            {/* Cost callout */}
            <div
              style={{
                marginTop: 12,
                background: `${COLORS.orange}10`,
                border: `1px solid ${COLORS.orange}30`,
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.orange, marginBottom: 4 }}>
                💰 Cost per Session
              </div>
              <div style={{ fontSize: 10, color: COLORS.textDim, lineHeight: 1.5 }}>
                ElevenLabs: ~$0.08–0.10/min
                <br />
                Claude tokens: variable
                <br />
                20-min session: est. $1.60–2.50
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer legend */}
      <div
        style={{
          marginTop: 32,
          padding: "16px 20px",
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 11, color: COLORS.textDim }}>
          <strong style={{ color: COLORS.text }}>Key Design Principle:</strong> Tutoring intelligence lives in our
          backend — ElevenLabs is the voice layer only. Swappable without touching the brain.
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {layers.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: l.color,
                }}
              />
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
