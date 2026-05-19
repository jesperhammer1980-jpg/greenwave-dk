/* =========================
   NAV OVERLAY
========================= */

.nav-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 500;
}

/* =========================
   FLOATING STOP BUTTON
========================= */

.nav-floating-stop {
  position: absolute;
  top: 18px;
  left: 18px;

  z-index: 900;

  pointer-events: auto;

  border: none;

  background: rgba(18, 18, 18, 0.92);

  color: #fff;

  padding: 12px 18px;

  border-radius: 14px;

  font-size: 15px;
  font-weight: 700;

  backdrop-filter: blur(12px);

  box-shadow:
    0 10px 30px rgba(0,0,0,0.35);

  cursor: pointer;

  transition:
    transform 0.18s ease,
    background 0.18s ease;
}

.nav-floating-stop:hover {
  transform: translateY(-1px);

  background: rgba(30, 30, 30, 0.96);
}

/* =========================
   ECO SCORE BADGE
========================= */

.eco-score-badge {
  position: absolute;

  top: 18px;
  right: 18px;

  z-index: 950;

  pointer-events: auto !important;

  border: none;

  min-width: 110px;

  padding: 12px 18px;

  border-radius: 999px;

  font-size: 16px;
  font-weight: 800;

  letter-spacing: 0.3px;

  backdrop-filter: blur(14px);

  cursor: pointer;

  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.eco-score-badge:hover {
  transform: translateY(-1px) scale(1.02);
}

.eco-ok {
  background:
    linear-gradient(
      135deg,
      rgba(34,197,94,0.95),
      rgba(21,128,61,0.95)
    );

  color: white;

  box-shadow:
    0 10px 30px rgba(34,197,94,0.28);
}

.eco-mid {
  background:
    linear-gradient(
      135deg,
      rgba(245,158,11,0.95),
      rgba(180,83,9,0.95)
    );

  color: white;

  box-shadow:
    0 10px 30px rgba(245,158,11,0.28);
}

.eco-low {
  background:
    linear-gradient(
      135deg,
      rgba(239,68,68,0.95),
      rgba(153,27,27,0.95)
    );

  color: white;

  box-shadow:
    0 10px 30px rgba(239,68,68,0.28);
}

/* =========================
   TURN CARD
========================= */

.turn-card {
  position: absolute;

  top: 86px;
  left: 50%;

  transform: translateX(-50%);

  width: min(92vw, 560px);

  pointer-events: none;

  background:
    linear-gradient(
      180deg,
      rgba(15,15,15,0.96),
      rgba(8,8,8,0.92)
    );

  border-radius: 28px;

  padding: 18px 20px 16px;

  box-shadow:
    0 20px 50px rgba(0,0,0,0.45);

  backdrop-filter: blur(18px);

  border:
    1px solid rgba(255,255,255,0.06);

  z-index: 700;
}

.turn-card-top {
  display: flex;
  align-items: center;
  gap: 18px;
}

.turn-icon {
  width: 74px;
  height: 74px;

  border-radius: 22px;

  background:
    linear-gradient(
      180deg,
      rgba(37,99,235,0.92),
      rgba(29,78,216,0.92)
    );

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 36px;
  font-weight: 800;

  color: white;

  flex-shrink: 0;

  box-shadow:
    0 10px 30px rgba(37,99,235,0.35);
}

.turn-copy {
  flex: 1;
  min-width: 0;
}

.turn-distance {
  font-size: 15px;
  font-weight: 700;

  color: rgba(255,255,255,0.72);

  margin-bottom: 4px;
}

.turn-instruction {
  font-size: 26px;
  font-weight: 800;

  line-height: 1.05;

  color: white;

  word-break: break-word;
}

.turn-road {
  margin-top: 8px;

  font-size: 14px;
  font-weight: 600;

  color: rgba(255,255,255,0.56);

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.turn-progress-wrap {
  width: 100%;
  height: 8px;

  border-radius: 999px;

  background: rgba(255,255,255,0.08);

  overflow: hidden;

  margin-top: 16px;
}

.turn-progress-bar {
  height: 100%;

  border-radius: inherit;

  background:
    linear-gradient(
      90deg,
      #2563eb,
      #60a5fa
    );

  transition:
    width 0.25s linear;
}

/* =========================
   SPEED SIGNS
========================= */

.speed-sign-stack {
  position: absolute;

  right: 18px;
  top: 230px;

  display: flex;
  flex-direction: column;
  gap: 14px;

  z-index: 700;

  pointer-events: none;
}

.speed-sign-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.speed-sign-label {
  font-size: 12px;
  font-weight: 700;

  color: rgba(255,255,255,0.72);

  text-transform: uppercase;

  letter-spacing: 0.4px;
}

.speed-sign {
  width: 76px;
  height: 76px;

  border-radius: 50%;

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 28px;
  font-weight: 900;

  color: white;

  box-shadow:
    0 12px 28px rgba(0,0,0,0.38);

  backdrop-filter: blur(10px);
}

.speed-sign-limit {
  background:
    radial-gradient(
      circle at 30% 30%,
      #ff5f5f,
      #b91c1c
    );

  border: 6px solid white;
}

.speed-sign-current {
  background:
    radial-gradient(
      circle at 30% 30%,
      #1f2937,
      #030712
    );
}

.speed-sign-recommended {
  background:
    radial-gradient(
      circle at 30% 30%,
      #3b82f6,
      #1d4ed8
    );
}

.speed-ok {
  box-shadow:
    0 0 0 3px rgba(34,197,94,0.9),
    0 12px 28px rgba(0,0,0,0.38);
}

.speed-warning {
  box-shadow:
    0 0 0 3px rgba(245,158,11,0.95),
    0 12px 28px rgba(0,0,0,0.38);
}

.speed-danger {
  box-shadow:
    0 0 0 3px rgba(239,68,68,0.95),
    0 12px 28px rgba(0,0,0,0.38);
}

/* =========================
   NAV BOTTOM BAR
========================= */

.nav-bottom {
  position: absolute;

  left: 18px;
  right: 18px;
  bottom: 18px;

  z-index: 700;

  pointer-events: none;
}

.nav-bottom-main {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 12px;

  background:
    linear-gradient(
      180deg,
      rgba(16,16,16,0.94),
      rgba(8,8,8,0.92)
    );

  border-radius: 24px;

  padding: 16px 18px;

  backdrop-filter: blur(18px);

  border:
    1px solid rgba(255,255,255,0.05);

  box-shadow:
    0 18px 40px rgba(0,0,0,0.45);
}

.nav-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-meta span {
  font-size: 12px;
  font-weight: 700;

  color: rgba(255,255,255,0.58);

  text-transform: uppercase;
}

.nav-meta strong {
  font-size: 21px;
  font-weight: 800;

  color: white;
}

/* =========================
   ECO SCORE MODAL
========================= */

.eco-score-modal {
  position: fixed;

  inset: 50% auto auto 50%;

  transform: translate(-50%, -50%);

  width: min(92vw, 560px);

  background:
    linear-gradient(
      180deg,
      rgba(18,18,18,0.98),
      rgba(8,8,8,0.96)
    );

  border-radius: 32px;

  padding: 26px;

  z-index: 4000;

  border:
    1px solid rgba(255,255,255,0.06);

  box-shadow:
    0 40px 90px rgba(0,0,0,0.6);

  backdrop-filter: blur(24px);
}

.eco-score-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.eco-score-header h2 {
  margin: 0;

  font-size: 32px;
  font-weight: 900;

  color: white;
}

.eco-score-header p {
  margin-top: 6px;

  color: rgba(255,255,255,0.6);

  font-size: 14px;
}

.eco-score-header button {
  border: none;

  background: rgba(255,255,255,0.08);

  color: white;

  border-radius: 14px;

  padding: 10px 16px;

  font-weight: 700;

  cursor: pointer;
}

.eco-score-body {
  margin-top: 24px;
}

.eco-score-total {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  padding: 28px 20px;

  border-radius: 28px;

  background:
    linear-gradient(
      135deg,
      rgba(37,99,235,0.25),
      rgba(59,130,246,0.14)
    );

  border:
    1px solid rgba(96,165,250,0.22);
}

.eco-score-total span {
  font-size: 14px;
  font-weight: 700;

  color: rgba(255,255,255,0.7);

  text-transform: uppercase;
}

.eco-score-total strong {
  margin-top: 8px;

  font-size: 58px;
  font-weight: 900;

  color: white;
}

.eco-score-grid {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 14px;

  margin-top: 22px;
}

.eco-score-card {
  background:
    rgba(255,255,255,0.04);

  border:
    1px solid rgba(255,255,255,0.05);

  border-radius: 22px;

  padding: 18px;
}

.eco-score-card span {
  display: block;

  font-size: 13px;
  font-weight: 700;

  color: rgba(255,255,255,0.68);

  margin-bottom: 8px;
}

.eco-score-card strong {
  display: block;

  font-size: 28px;
  font-weight: 900;

  color: white;
}

.eco-score-card small {
  display: block;

  margin-top: 10px;

  line-height: 1.45;

  color: rgba(255,255,255,0.48);

  font-size: 12px;
}

.eco-score-comment {
  margin-top: 20px;

  text-align: center;

  padding: 16px 18px;

  border-radius: 18px;

  background:
    rgba(255,255,255,0.05);

  color: rgba(255,255,255,0.82);

  font-size: 15px;
  font-weight: 700;
}

/* =========================
   MOBILE
========================= */

@media (max-width: 768px) {
  .turn-card {
    width: calc(100vw - 22px);

    top: 84px;
  }

  .turn-instruction {
    font-size: 22px;
  }

  .turn-icon {
    width: 62px;
    height: 62px;

    font-size: 30px;
  }

  .speed-sign {
    width: 64px;
    height: 64px;

    font-size: 24px;
  }

  .nav-bottom-main {
    grid-template-columns: 1fr;
  }

  .eco-score-grid {
    grid-template-columns: 1fr;
  }

  .eco-score-total strong {
    font-size: 46px;
  }
}
