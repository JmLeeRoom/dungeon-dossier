<style>
/* ═══════════════════════════════════════════════════════════════════
   던전 수사 조서 · 제출용 PDF 인쇄 스타일시트
   브라우저 인쇄(Ctrl+P) → "대상: PDF로 저장" → 배경 그래픽 켜기
   ═══════════════════════════════════════════════════════════════════ */

:root {
  --ink:        #0f0d0a;   /* Dark Ink   — 본문 잉크 */
  --ink-soft:   #2b2620;
  --gold:       #d4af37;   /* Gold       — 강조·머리글 */
  --gold-deep:  #8a6f1e;
  --cyan:       #00b4d8;   /* Cyan       — 시스템·수치 */
  --cyan-deep:  #056f8a;
  --parchment:  #f4e8c1;   /* Parchment  — 지면 */
  --parchment2: #fbf5e2;
  --rule:       #c9b98c;
  --red:        #a94435;
  --green:      #4f7a46;
  --grey:       #7d7566;
}

@page {
  size: A4 portrait;
  margin: 17mm 15mm 15mm 15mm;
}

body {
  background: var(--parchment2);
  color: var(--ink);
  font-family: "Pretendard", "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif;
  font-size: 10.2pt;
  line-height: 1.68;
  max-width: 190mm;
  margin: 0 auto;
  padding: 6mm 4mm 12mm;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── 제목 계층 ─────────────────────────────────────────────── */
h1 {
  font-size: 21pt;
  letter-spacing: -0.02em;
  color: var(--ink);
  border-bottom: 3px double var(--gold);
  padding-bottom: 4mm;
  margin: 0 0 5mm;
}
h2 {
  font-size: 14.5pt;
  color: var(--parchment);
  background: linear-gradient(90deg, var(--ink) 0%, var(--ink-soft) 78%, transparent 100%);
  border-left: 5px solid var(--gold);
  padding: 2.6mm 4mm;
  margin: 9mm 0 4mm;
  page-break-before: always;
  page-break-after: avoid;
}
h2:first-of-type, h2.no-break { page-break-before: auto; }
h3 {
  font-size: 12pt;
  color: var(--gold-deep);
  border-bottom: 1.5px solid var(--rule);
  padding-bottom: 1.4mm;
  margin: 6.5mm 0 3mm;
  page-break-after: avoid;
}
h4 {
  font-size: 10.6pt;
  color: var(--cyan-deep);
  margin: 4.5mm 0 2mm;
  page-break-after: avoid;
}

/* ── 표 ────────────────────────────────────────────────────── */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 3mm 0 5mm;
  font-size: 8.9pt;
  page-break-inside: avoid;
}
thead th {
  background: var(--ink);
  color: var(--gold);
  font-weight: 600;
  text-align: left;
  padding: 2mm 2.4mm;
  border: 1px solid var(--ink);
  letter-spacing: 0.01em;
}
tbody td {
  padding: 1.7mm 2.4mm;
  border: 1px solid var(--rule);
  vertical-align: top;
}
tbody tr:nth-child(even) td { background: var(--parchment); }

/* ── 인용문 ─────────────────────────────────────────────────── */
blockquote {
  margin: 3.5mm 0;
  padding: 2.8mm 4mm;
  background: var(--parchment);
  border-left: 4px solid var(--cyan);
  color: var(--ink-soft);
  page-break-inside: avoid;
}
blockquote p { margin: 0.8mm 0; }

/* ── 코드 ──────────────────────────────────────────────────── */
code {
  font-family: "D2Coding", "Cascadia Mono", "Consolas", monospace;
  font-size: 8.9pt;
  background: #efe4c2;
  color: #4a3a10;
  padding: 0.3mm 1.1mm;
  border-radius: 2px;
  border: 1px solid #dbc98f;
}
pre {
  background: var(--ink);
  color: var(--parchment);
  padding: 3.4mm 4mm;
  border-left: 4px solid var(--cyan);
  border-radius: 3px;
  overflow-x: auto;
  font-size: 8.6pt;
  line-height: 1.55;
  page-break-inside: avoid;
  margin: 3mm 0 5mm;
}
pre code {
  background: none;
  border: none;
  color: inherit;
  padding: 0;
  font-size: inherit;
}

/* ── 키보드 뱃지 ────────────────────────────────────────────── */
kbd {
  font-family: "D2Coding", "Consolas", monospace;
  font-size: 8.4pt;
  background: linear-gradient(180deg, #fffdf4 0%, #e6d7a8 100%);
  color: var(--ink);
  border: 1px solid var(--gold-deep);
  border-bottom-width: 2.4px;
  border-radius: 3px;
  padding: 0.4mm 1.8mm;
  white-space: nowrap;
  box-shadow: 0 1px 0 rgba(0,0,0,.18);
}

/* ── 커스텀 박스 ────────────────────────────────────────────── */
.cover {
  border: 2px solid var(--gold);
  border-top-width: 8px;
  background: var(--ink);
  color: var(--parchment);
  padding: 8mm 8mm 6mm;
  margin-bottom: 7mm;
  page-break-inside: avoid;
}
.cover .eyebrow { color: var(--cyan); letter-spacing: .28em; font-size: 8.4pt; }
.cover h1 { color: var(--parchment); border: none; margin: 3mm 0 1mm; padding: 0; font-size: 26pt; }
.cover .sub { color: var(--gold); font-size: 11pt; margin: 0 0 4mm; }
.cover .meta { font-size: 8.6pt; color: #cbbf9c; border-top: 1px solid #4a4133; padding-top: 3mm; }

.callout {
  border: 1px solid var(--rule);
  border-left: 5px solid var(--gold);
  background: var(--parchment);
  padding: 3mm 4mm;
  margin: 3.5mm 0;
  page-break-inside: avoid;
}
.callout.warn  { border-left-color: var(--red);  background: #fbe9e5; }
.callout.info  { border-left-color: var(--cyan); background: #e6f6fb; }
.callout .tag {
  display: inline-block;
  font-size: 7.8pt; font-weight: 700; letter-spacing: .12em;
  background: var(--ink); color: var(--gold);
  padding: 0.5mm 2mm; border-radius: 2px; margin-bottom: 1.6mm;
}
.callout.warn .tag { background: var(--red);  color: #fff; }
.callout.info .tag { background: var(--cyan-deep); color: #fff; }

.chip {
  display: inline-block;
  font-size: 8pt; font-weight: 600;
  background: var(--cyan-deep); color: #fff;
  padding: 0.3mm 1.8mm; border-radius: 9px; margin-right: 1mm;
}
.chip.gold { background: var(--gold-deep); }
.chip.red  { background: var(--red); }

hr {
  border: none;
  border-top: 2px solid var(--rule);
  margin: 6mm 0;
}

/* ── 인쇄 최적화 ────────────────────────────────────────────── */
@media print {
  body { padding: 0; background: #fff; }
  a { color: var(--cyan-deep); text-decoration: none; }
  .no-print { display: none; }
}
</style>

<div class="cover">
  <div class="eyebrow">DUNGEON DOSSIER · OFFICIAL GAME MANUAL</div>
  <h1>던전 수사 조서</h1>
  <div class="sub">게임 소개 · 플레이 가이드 · 실행 및 에셋 워크벤치 매뉴얼</div>
  <div class="meta">
    문서 버전 1.0 · 2026-08-08 발행 · A4 인쇄 규격<br>
    대상 독자: 기획서 평가위원 · 신규 플레이어 · 기획자(PM) · 개발자<br>
    대상 빌드: <code>dungeon-dossier</code> / TypeScript · Vite 8.2 · PixiJS 8.19 · Zod 4.4
  </div>
</div>

> **본 문서에 대하여** — 이 매뉴얼의 모든 수치·좌표·명령어·라벨은 저장소 소스 코드와 콘텐츠 데이터를 직접 대조해 작성했습니다. 기획 초안 문서와 실제 구현이 다른 항목은 **구현 기준**으로 기재하고, 차이가 있는 곳은 **부록 D**에 모아 두었습니다.

---

## 목차

| 장 | 제목 | 대상 독자 |
|---|---|---|
| **SECTION 1** | 게임 개요 — 세계관·등장인물·핵심 게임성·아키텍처 | 평가위원 · 플레이어 |
| **SECTION 2** | 플레이 방법 및 UI 조작 가이드 | 플레이어 |
| **SECTION 3** | 실행 방법 & 접속 모드 | 개발자 · 시연 담당 |
| **SECTION 4** | 기획자용 에셋 워크벤치 매뉴얼 | 기획자(PM) · 아트 |
| **부록 A** | 판정 코드 21종 전수표 | 밸런서 |
| **부록 B** | 밸런스 수치 전수표 | 밸런서 |
| **부록 C** | 문제 해결(Troubleshooting) | 전원 |
| **부록 D** | 표기·사실확인 노트 | 평가위원 |

---

## SECTION 1. 게임 개요

### 1.1 타이틀 & 장르

| 항목 | 내용 |
|---|---|
| **정식 타이틀** | 던전 수사 조서 (Dungeon Dossier) |
| **부제 / 별칭** | 던전탐정 김태훈 (Dungeon Detective Kim Taehoon) |
| **장르** | 데이터 기반 추리 카드 게임 — 이세계 대질 심문 로그라이크 |
| **플랫폼** | 데스크톱 웹 브라우저 (Chrome 최신) |
| **표시 해상도** | 1280 × 800 HD (640 × 400 도트 좌표계 × 2배 정수 업스케일) |
| **아트 스타일** | 픽셀 아트 · PNG당 불투명 RGBA 16색 제한 · NEAREST 필터 |
| **한 판 분량** | 15노드 1회차 완주 · 무인 시연 기준 약 150초 |
| **기술 스택** | TypeScript 5.9 · Vite 8.2 · PixiJS 8.19 · Zod 4.4 · Howler 2.2 |
| **글꼴** | Galmuri11 (SIL OFL 1.1) 로컬 번들 비트맵 폰트 |

### 1.2 세계관 & 시놉시스

> 이세계에 떨어진 형사 **김태훈**은 믹스커피 한 상자 절도 사건을 조사하다 허위 복지비 영수증을 발견하고, 포션 상점 횡령과 차원 이동 엘리베이터 부실 공사로 이어지는 **마왕 홀딩스**의 거대한 비자금 구조를 폭로한다. 마지막에는 자신의 귀환 티켓과 사건의 진실 중 하나를 선택해야 한다.

무대는 마왕군이 기업화된 조직 **마왕 홀딩스**의 던전 취조실입니다. 플레이어는 형사 김태훈이 되어, 몬스터 용의자가 늘어놓는 진술을 **여섯 개의 태그**(누가·언제·어디서·무엇을·어떻게·왜)로 분해하고, 사건 조서에 모아 둔 **증거물**을 들이대어 진술과 증거 사이의 **논리적 모순**을 찾아냅니다.

핵심 긴장은 "자백을 받아내는 것"과 "정당하게 받아내는 것" 사이에 있습니다. 용의자의 **평정심**을 0으로 만들면 자백은 받지만 그것은 강제 자백(허위 자백)으로 기록되고, 정확한 모순 입증 없이 밀어붙일 때마다 **강압 수사** 수치가 쌓여 결국 수사권 박탈로 이어집니다.

### 1.3 등장인물

#### 수사관 측

| 인물 | 역할 | 게임 내 기능 |
|---|---|---|
| **김태훈** | 주인공 · 베테랑 형사 | 플레이어 자신. 컷신 초상화와 과로 패배 화면(`형사 김태훈, 쓰러지다`)에 등장 |
| **김 인턴** | 파트너 | 스킬 `skill_kim_intern_note` 1종. 사용 시 **강압 −4**, 쿨다운 **3턴**. 초상은 `base`(사용 가능) / `used`(쿨다운) 2상태 |

#### 심문 대상 9명

| 사건 | 노드 | 대상 | 배역 | 평정심 최대 | CP/턴 | 강압 한계 | 방패/라운드 |
|---|---|---|---|---|---|---|---|
| 튜토리얼 | 1 | 물컹이 (SLIME) | 용의자 | 60 | 3 | 100 | 1 |
| 튜토리얼 | 3 | 하피 (HARPY) | **참고인** | 70 | 3 | 100 | 1 |
| 튜토리얼 | 5 **BOSS** | 미노타우로스 | 용의자 | 120 | 3 | 100 | 1 |
| EP001 | 6 | 고블린 | 용의자 | 90 | 3 | 100 | 1 |
| EP001 | 8 | 오크 | 용의자 | 100 | 3 | 100 | 1 |
| EP001 | 10 **BOSS** | 서큐버스 | 용의자 | 140 | 3 | 100 | 2 |
| EP004 | 11 | 드워프 | 용의자 | 110 | 3 | 100 | 1 |
| EP004 | 13 | 사이클롭스 | 용의자 | 120 | **2** | 100 | 1 |
| EP004 | 15 **최종 BOSS** | 타락한 용사 | 용의자 | 180 | 3 | **40** | 2 |

<div class="callout warn">
<span class="tag">난이도 설계 포인트</span>
<b>사이클롭스</b>는 게임 전체에서 유일하게 턴당 CP가 2입니다(증인 보호 전까지 행동력이 제한됨). <b>타락한 용사</b>는 유일하게 강압 한계가 40이라, BEST 판정의 강압 상한(40 이하)과 실패선이 정확히 맞물립니다 — 한 번의 무리한 압박이 곧 패배입니다.
</div>

#### 수록 사건 3건

| 사건 ID | 제목 | Act | 턴 제한 | 배경 |
|---|---|---|---|---|
| `case_tutorial` | 황금 엘릭서 믹스커피 절도 | 0 | 18턴 | 심문실 · 시안 |
| `case_ep001_red_ledger` | 붉은 장부와 사라진 보급품 | 1 | 27턴 | 심문실 · 세피아 |
| `case_ep004_midnight_express` | 심야 용맥 급행의 우회권 | 4 | 32턴 | 심문실 · 마젠타 |

각 사건은 **진술(Claim) 18개 · 증거 8개 · 심문 조우 3개 · 질문 경로 6개**로 동일한 분량 규격을 따릅니다. 턴 제한은 조우별이 아니라 **사건 단위**로, 같은 사건의 세 조우가 같은 제한을 공유합니다.

### 1.4 핵심 게임성

#### ① TruthGraph & 모순 검증 엔진

진실 계층 **TruthGraph**는 게임 시작 시 만들어져 재귀적으로 동결되는 읽기 전용 사실 기록입니다. 각 진술은 세계 사실과의 관계를 5단계로 갖습니다 — `CONSISTENT_WITH_WORLD` · `CONTRADICTED_BY_WORLD` · `PARTIALLY_TRUE` · `UNVERIFIABLE` · `IRRELEVANT`. 즉 "거짓말인가?"의 참/거짓이 아니라 **관계의 등급**입니다.

<div class="callout info">
<span class="tag">설계 원칙</span>
<b>판정 엔진은 진실값을 읽지 않습니다.</b> 모순 판정은 오직 플레이어가 제출한 <b>증거</b>와 사건 데이터의 <b>입증 규칙(ProofRule)</b>만으로 계산됩니다. 진실 계층은 '정답'이 아니라 콘텐츠 정합성 검증용 기준선이며, 공개 DTO에는 truth 계열 <b>22개 키가 재귀적으로 차단</b>되어 UI와 AI가 정답을 볼 수 없습니다.
</div>

진술은 서로 **독립된 3축**으로 상태를 갖습니다.

| 축 | 값 (각 6종) | 의미 |
|---|---|---|
| **약속** Commitment | UNSTATED · ASSERTED · **COMMITTED** · REVISED · RETRACTED · CONTRADICTED | 용의자가 그 진술에 얼마나 발이 묶였는가 |
| **인식** Epistemic | UNKNOWN · SUSPECTED · PROVISIONAL · SUPPORTED · **REFUTED** · UNRESOLVED | 수사관이 무엇을 입증했는가 |
| **표현** Presentation | NORMAL · COMPOUND · DISTORTED · HIDDEN · **LOCKED** · DUPLICATED | 화면에 어떻게 보이는가 |

한 번의 제출은 **10단계 순수 함수 판정**을 통과합니다.

```text
① ACTION_COMPATIBILITY  행동 의도와 대상이 호환되는가
② TARGET_EXPOSURE       그 진술이 지금 공개·조작 가능한가
③ RELEVANCE             증거가 요구 입증 범위를 얼마나 덮는가  (NONE / PARTIAL / FULL)
④ RELATION              지지인가 모순인가                      (SUPPORTS / CONTRADICTS / NEUTRAL / AMBIGUOUS)
⑤ SCOPE_COVERAGE        필요 범위 충족 여부                    (INSUFFICIENT / PROVISIONAL / SUFFICIENT)
⑥ CONFIDENCE            최약 링크(min) 신뢰도 ≥ 기준치인가
⑦ INDEPENDENCE          독립 출처 수를 뿌리까지 거슬러 세었는가 (MET / UNMET)
⑧ ALTERNATIVE_HYPOTHESES 대안 가설이 남아 있는가               (NOT_APPLICABLE / CLEARED / REMAINING)
⑨ PROCEDURE             절차가 정당한가                        (FAIR / COERCIVE / FORBIDDEN)
⑩ LOOKUP                34행 판정표에서 최종 코드 확정
```

10단계 전체를 통과하는 것은 **모순(CONTRADICT)** 과 **확인(CONFIRM)** 의도뿐이며, 나머지 의도는 ②단계 뒤 곧바로 ⑨→⑩으로 분기합니다. 6개 축의 조합 공간 **432가지 전부**가 34행 판정표로 빠짐없이 덮이는지 테스트가 상시 검증합니다.

**직접 모순**(`R_DIRECT_CONTRADICTION`)이 성립하는 조건은 판정표 34행 중 단 2행뿐입니다.

> 의도 = CONTRADICT · 관련성 = FULL · 관계 = CONTRADICTS · 충분성 = SUFFICIENT · 독립성 = MET · 대안가설 = CLEARED 또는 NOT_APPLICABLE

독립성이 UNMET이거나 대안 가설이 남으면 **정황 포착**(`R_INDIRECT_SUSPICION`)으로 강등됩니다. 반대로, 이미 충분히 입증된 **참인 진술을 공격**하면 단 하나의 조합에서 `R_TRUTH_ATTACKED`(진실 공격)가 발동해 강압이 15 치솟습니다.

#### ② 평정심 vs 강압 수사

| 자원 | 한국어 표기 | 시작값 | 상한 | 하는 일 |
|---|---|---|---|---|
| **composure** | 평정심 / 평정 | 최대치(전량) | 조우별 60–180 | 0이 되면 자백. 단 그 자백은 **강제 자백** |
| **coercion** | 강압 | 0 | 전역 **100** | 조우별 한계를 **초과**하면 즉시 실패(수사권 박탈) |
| **commandPoints** | CP | **0** | 조우별 3 (사이클롭스 2) | 카드 비용. 턴 시작마다 **덮어쓰기 복구**(이월 없음) |
| **stress** | 스트레스 | 100 | 100 | 런 전체 공유. 0 이하면 과로 사망 |
| **trust** | 신뢰도 | 0 | 3 | 임계값 [1, 2] |
| **dp** | DP | 0 | — | 사건 포인트 |
| **turn** | 턴 | 0 | 사건별 18/27/32 | 제한에 **도달**하면 부분 해결로 마감 |

<div class="callout">
<span class="tag">역설적 승리 조건</span>
<b>평정심은 깎되, 0으로 만들면 안 됩니다.</b> 최고 판정(BEST)은 평정심이 <b>최대치의 1%~30% 구간</b>(스위트 스팟)에 살아 있고, 필수 목표를 모두 달성했으며, 강압이 40 이하일 때 <b>[진술 확보] 버튼을 직접 눌러야</b> 성립합니다. 조건이 충족돼도 자동 종료되지 않습니다.
</div>

강압이 오르는 판정은 정확히 세 가지뿐입니다 — **근거 부족 +2**, **진실 공격 +15**, **무관한 증거 +5**. 반대로 **직접 모순과 정황 포착은 강압을 전혀 올리지 않습니다.** 정확한 수사는 공짜입니다.

#### ③ 5레이어 조건부 카드 시스템

카드 한 장은 원화 **640 × 725 px** 공간에서 5개 레이어로 합성됩니다.

| Z | 레이어 | 성격 | 원화 사각형 (x, y, w, h) | 내용 |
|---|---|---|---|---|
| **0** | `base` | 영구 | 0, 0, 640, 725 | 카드 템플릿 |
| **1** | `illust` | 영구 | 344, 176, 256, 256 | 의도별 일러스트(질문·모순·압박) |
| **2** | `stamp` | 부착 | 40, 240, 192, 192 | 인장 — 파란 인주(강압 −1) / 붉은 인주(평정 −2 추가) |
| **3** | `post` | 부착 | 0, 0, 640, 725 | 포스트잇 — 특수 효과(예: WHEN 면 진술 공개) |
| **4** | `evidence` | 부착 | 256, 16, 128, 128 | 결합 증거물, **카드당 최대 3개** |

증거가 여러 개면 152 px 간격으로 좌우 대칭 전개됩니다. 손패에서는 원화를 **0.2배**로 축소해 128 × 145 px로 그리며, 상세 모달에서만 원화 해상도 그대로(HD 1:1) 보여줍니다.

### 1.5 5계층 아키텍처

<div class="callout info">
<span class="tag">용어 주의</span>
"5계층"은 두 가지를 가리킵니다 — <b>아키텍처 5계층</b>(아래)과 <b>카드 렌더링 5레이어</b>(1.4 ③). 두 개념은 서로 무관합니다.
</div>

```text
   ┌─────────────────────────────────────────────────────┐
   │  L1   TruthGraph / domain                           │
   └─────────────────────────────────────────────────────┘
          세계의 사실. 시작 시 동결되는 읽기 전용 계층
                             ↓  단방향
   ┌─────────────────────────────────────────────────────┐
   │  L2   KnowledgeState                                │
   └─────────────────────────────────────────────────────┘
          플레이어가 "아는" 것. 진실과 분리된 지식 상태
                             ↓
   ┌─────────────────────────────────────────────────────┐
   │  L3   GameRule Engine                               │
   │       resolution · cards · encounter · run          │
   └─────────────────────────────────────────────────────┘
          순수 함수. PixiJS / DOM / fetch / 시계 / 난수 금지
                             ↓
   ┌─────────────────────────────────────────────────────┐
   │  L4   PublicDTO + Dialogue actor                    │
   └─────────────────────────────────────────────────────┘
          명시 조립된 DTO만 전달. truth 계열 22개 키 차단
                             ↓
   ┌─────────────────────────────────────────────────────┐
   │  L5   PixiJS Presentation                           │
   └─────────────────────────────────────────────────────┘
          엔진 객체를 직접 받지 않음
```

핵심 계약은 **엔진이 판정하고 AI는 판정 이후의 표현만 담당한다**는 것입니다. 모든 무작위성은 `run_seed`에서 용도별로 파생한 스트림만 사용하며, 이 경계는 ESLint · dependency-cruiser · Vitest 아키텍처 검사로 CI에서 강제됩니다. 새 사건을 추가할 때 `src/engine/`을 **한 줄도 고치지 않는 것**이 프로젝트의 핵심 계약입니다.

### 1.6 진행 구조 — 15노드 단선 진행

```text
  01 E ── 02 V ── 03 E ── 04 V ── 05 B     Act 0   물컹이 · 하피 · 미노타우로스
  06 E ── 07 V ── 08 E ── 09 V ── 10 B     Act 1   고블린 · 오크 · 서큐버스
  11 E ── 12 V ── 13 E ── 14 V ── 15 B     Act 4   드워프 · 사이클롭스 · 타락한 용사

  E = ENCOUNTER 6      V = EVENT 6      B = BOSS 3
  진행 방식: 노드 인덱스 +1 선형 전진 · 경로 분기 없음
```

노드 상태는 `CLEARED` / `CURRENT` / `LOCKED` 3종이며, 클리어된 노드에는 기울어진 **「완료」 도장**이 찍힙니다. 6개 이벤트 노드는 A~F 패턴을 **정확히 한 번씩** 사용합니다.

---

## SECTION 2. 플레이 방법 및 UI 조작 가이드

### 2.1 화면 구성 (1280 × 800 HD 뷰포트)

게임은 **640 × 400 도트 가상 좌표계**로 그린 뒤 **2배 정수 배율**로 확대해 1280 × 800에 표시합니다. 배율은 항상 정수로 내림 계산되며 최대 2배에서 멈추므로, 4K 모니터에서도 캔버스는 1280 × 800에서 정지하고 남는 여백은 중앙 정렬 레터박스가 됩니다. 텍스처 스케일 모드는 `nearest`, 안티앨리어싱은 꺼져 있어 픽셀이 뭉개지지 않습니다.

```text
   640 × 400 내부 좌표계 · 표시 좌표는 모두 × 2

   ┌────────────────────────────────────────────┐
   │████████████████████████████████████████████│  y0    HUD 26px · 명패 / 게이지 / TURN
   │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│  y26   상태 스트립 16px · CP / STRESS
   │                                            │
   │               ┌──────────────┐             │  y34   용의자 초상 216×216 @ (212,34)
   │               │              │             │        base / upset / lose 3상태
   │               │              │             │
   │               └──────────────┘             │        하반신은 책상 전경에 가려짐
   │  ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐            │  y205  태그 칩 6개 · 각 26px
   │  └───┘└───┘└───┘└───┘└───┘└───┘            │        누가 언제 어디서 무엇을 어떻게 왜
   │  ────────────────────────────────────      │  y276  판정 배너 628×11
   │════════════════════════════════════════════│  y239  책상 전경 640×161 (원화 1280×321)
   │  ┌──────┐  ┌────────────────┐  ┌────────┐  │  y288  파우치 · 진술 · 제출 버튼
   │  └──────┘  └────────────────┘  └────────┘ o│  y296  파트너 초상 88×88 @ (546,296)
   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  y371  카드 손패 · 상단 20 %(29px) 노출
   └────────────────────────────────────────────┘  y400
```

#### 상단 — 정보 HUD (y 0 ~ 41)

| 요소 | 위치 (640×400 기준) | 크기 | 비고 |
|---|---|---|---|
| HUD 배경판 | (0, 0) | 640 × 26 | 딥 잉크 α 0.94 |
| 용의자 명패 | (7, 4) | 124 × 18 | 붉은 판 + `용의자  {이름}` |
| **평정심 게이지** | (159, 7) | 164 × 12 | 시안 `#73c8c2` · 라벨 39px 제외 실 바 125px |
| **강압 게이지** | (346, 7) | 152 × 12 | 적색 `#a94435` · 10칸 · 실 바 113px |
| 평정심 / 강압 아이콘 | (139, 5) / (326, 5) | 16 × 16 | 원화는 32 × 32 |
| 강압 경고 쪽지 | (506 + i×7, 8) | 8 × 11 | 최대 5장, `floor(강압/한계 × 5)`장 |
| 턴 표시 | (552, 9) | — | `TURN 현재/제한` |
| 상태 스트립 | (0, 26) | 640 × 16 | CP는 ☕ 반복, STRESS ≤ 20이면 적색 |

#### 중단 — 취조실 & 진술 (y 34 ~ 288)

| 요소 | 위치 | 크기 | 비고 |
|---|---|---|---|
| 용의자 초상 | (212, 34) | 216 × 216 | 원화 512 × 512 · `base`/`upset`/`lose` |
| 태그 칩 6개 | (12 + i×103, 205) | 99 × 26 | 마지막 `왜`만 101px |
| 판정 배너 | (6, 276) | 628 × 11 | 한 줄, 넘치면 `…` |
| **책상 전경** | (0, 239) | 640 × **161** | 원화 **1280 × 321** — 321은 홀수라 160.5를 올림 |
| 진술 타이프라이터 | (164, 288) | 320 × 48 | 28 ms/자 · 커서 640 ms 주기 |

<div class="callout info">
<span class="tag">디오라마 구성</span>
초상 하단은 y=250, 책상 상단은 y=239입니다. 용의자의 하반신이 의도적으로 책상 전경에 가려져 <b>취조실 안에 실제로 앉아 있는</b> 입체감을 만듭니다.
</div>

태그 칩은 좌측이 뾰족한 5각형이며 4가지 상태를 가집니다.

| 상태 | 표식 | 의미 |
|---|---|---|
| `DEFAULT` | (없음) | 평범한 진술 |
| `SHIELDED` | ◆ | 방패가 걸려 있어 먼저 깎아야 함 |
| `BROKEN` | × | 이미 무너뜨린 진술 |
| `SHAKEN` | ! | 흔들리는 중 |

#### 하단 — 조작 영역 (y 288 ~ 400)

| 요소 | 위치 | 크기 | 조작 |
|---|---|---|---|
| 증거 파우치 | (6, 292) | 150 × 52 | 36 × 36 슬롯 3칸. 클릭 시 조서 열림 |
| **제출 / RETURN** | (452, 296) | 82 × 22 | 카드 + 태그(+ 증거) 선택 시 활성 |
| **진술 확보** | (452, 322) | 78 × 18 | BEST 조건 충족 시에만 활성 |
| **조서 열기** | (452, 344) | 72 × 18 | 증거 조서 오버레이 |
| 파트너 초상 | (546, 296) | 88 × 88 | 쿨다운 중 딤 + 남은 턴 수 표시 |
| 카드 손패 | (104/180/256/332/408, 371) | 128 × 145 | 최대 5장 렌더 |

### 2.2 심문 진행 순서 (Turn Flow)

```text
  ① 진술 수집 — 용의자가 6개 태그로 분해된 진술을 타이프라이터로 뱉는다
        ↓
  ② 조서 열람 — [조서 열기]로 증거 목록 · 입증 범위 · "입증하지 못하는 것" 확인 (비용 0)
        ↓
  ③ 증거 결합 — 증거를 최대 3개까지 골라 [첨부 적용] · 카드 evidence 레이어에 부착
        ↓
  ④ 카드 연결 — 카드를 드래그해 태그 칩 위로. 점선 링크가 칩 중앙에 스냅
        ↓
  ⑤ 제 출     — [제출 / RETURN] · 10단계 판정 · 판정 코드 확정
        ↓
  ⑥ 반응 연출 — 전면 판정 연출 1200 ms · 평정심 감소 / 강압 상승 + 징벌 연출 900 ms
        ↓
  ⑦ 턴 종료   — CP 복구 · 카드 드로우 · 쿨다운 감소 (자동) → ①로
```

<div class="callout warn">
<span class="tag">주의</span>
심문 화면에는 <b>플레이어용 「턴 종료」 버튼이 없습니다.</b> 턴 진행은 카드 제출 결과를 처리하는 과정에서 자동으로 일어납니다.
</div>

#### 8단계 기획 턴 ↔ 21개 실행 상태

조우 상태 머신은 **19개 진행 상태 + 2개 종료 상태 = 21개**로 구성되며, 8단계 기획 턴이 14개 턴 상태를 **중복 없이 정확히 한 번씩** 덮는지 모듈 로드 시점에 검사합니다. 매핑이 어긋나면 게임이 시작조차 하지 못하고 예외로 죽습니다.

| # | 기획 턴 단계 | 대응 실행 상태 |
|---|---|---|
| 1 | STATEMENT | `ENTER_FLOW_NODE` → `RENDER_STATEMENT` |
| 2 | TAG_REFRESH | `EMIT_PUBLIC_DTO` |
| 3 | SHIELD | `TURN_START` |
| 4 | DOSSIER_REVIEW | `FREE_REVIEW` |
| 5 | CARD_SELECTION | `BUILD_ARGUMENT` → `SUBMIT_ACTION` |
| 6 | JUDGMENT | `RESOLVE` → `APPLY_EFFECTS` |
| 7 | ENEMY_RESPONSE | `RENDER_REACTION` → `RUN_MODIFIERS` |
| 8 | END_CHECK | `CHECK_FLOW_TRANSITION` → `CHECK_OBJECTIVES` → `CHECK_OUTCOME` |

부팅 상태 7개(`ENCOUNTER_INIT`·`LOAD_CASE`·`VALIDATE`·`BUILD_TRUTH`·`INIT_KNOWLEDGE`)와 종료 상태 2개(`ENCOUNTER_COMPLETE`·`FAILED`)가 나머지입니다. 조서 조회 API는 **`FREE_REVIEW` 상태에서만** 호출할 수 있으며, 조회 결과에는 판정 예측이나 정답 조합이 API 수준에서 존재하지 않습니다.

### 2.3 카드 시스템

#### 카드 카탈로그 14종

| 카드 | 의도 | CP | 효과 |
|---|---|---|---|
| 누구였나 | QUERY | 1 | 인물과 관련된 진술을 캐묻는다 |
| 언제였나 | QUERY | 1 | 시각과 관련된 진술을 캐묻는다 |
| 진술 명료화 | CLARIFY | 1 | 모호한 진술을 다시 정리하게 한다 |
| 심층 해명 | CLARIFY | 2 | 해당 태그의 방어를 1 낮춘다 |
| 사실 확인 | CONFIRM | 1 | 증거를 대어 진술의 사실성을 확인한다 |
| 신중한 확인 | CONFIRM | 2 | 확정하고 **강압 −1** |
| **모순 지적** | CONTRADICT | 2 | 증거로 진술의 모순을 지적한다 |
| **정밀 반박** | CONTRADICT | 3 | 증거만으로 **평정심 −4** |
| 호흡 정돈 | RECOVER | 1 | **강압 −4** |
| 속도 조절 | RECOVER | 1 | **강압 −2**, 카드 1장 추가 드로우 |
| 압박 심문 | PRESSURE | 2 | **평정심 −8**, 단 **강압 +5** |
| 감식 의뢰 | FORENSIC | 2 | 제출 증거 등급을 한 단계 승급 |
| 특별 고지 | SPECIAL | 1 | 수사 절차 고지로 **강압 −3** |
| 확약 클립 | COMMIT | 2 | 진술을 COMMITTED로 고정 |

**시작 덱 6장**: 누구였나 · 언제였나 · 진술 명료화 · 사실 확인 · 모순 지적 · 호흡 정돈

<div class="callout">
<span class="tag">COMMITTED 콤보</span>
「확약 클립」으로 진술을 <code>COMMITTED</code>로 고정한 뒤 직접 모순을 성립시키면 평정심 피해에 <b>×1.4 배수</b>가 곱해집니다(18 → <b>25.2</b>). 상태 전이 가중치도 1이 아니라 2가 됩니다.
</div>

#### 카드 조작 — 정확한 동작

| 동작 | 수치 |
|---|---|
| 평상시 노출 | 카드 높이의 **20 %** = 29 px (restY 371) |
| 호버 시 노출 | **40 %** = 58 px (hoverY 342) → 정확히 **29 px 상승** |
| 호버 하이라이트 | 테두리 2 px — 호버 **시안**, 선택 **앰버**(호버 우선) |
| 부채꼴 회전 | `(index − 2) × 0.02` rad → −0.04 / −0.02 / 0 / 0.02 / 0.04 |
| 드래그 임계값 | 포인터 이동 **4 px**. 미만이면 클릭 → 상세 모달 |
| 드래그 중 위치 | 커서 기준 `x − 64`, `y − 153` (여백 8 px) |
| 점선 링크 | 곡률 −28 px · 대시 6 px / 간격 4 px · 48 표본 · 시안 2 px |
| 드롭 판정 | 6개 태그 칩 사각형, 겹치면 **가장 위 칩**이 승리 |
| 상세 모달 | 무대 배율 0.5 → 320 × 362.5 @ (160, 19) = HD **640 × 725 1:1** |

카드를 **누르는 즉시**(pointerdown) 선택이 확정되고 종이 넘김 효과음이 재생됩니다. 호버 시 y 좌표만 바뀌므로 손패가 재정렬되지 않습니다.

### 2.4 판정 결과 읽기

#### 판정 배너 4색

| 톤 | 색 | 기본 헤드라인 | 발생 조건 |
|---|---|---|---|
| CONTRADICTION | 적 `#a94435` | **모순 포착** | `R_DIRECT_CONTRADICTION` · `R_INDIRECT_SUSPICION` |
| SUPPORT | 녹 `#6f9c68` | **진술 확인** | 확인 계열 9개 성공 코드 |
| MISS | 앰버 `#d2a548` | **판정 보류** | 그 외 전부 |
| INVALID | 회 `#968567` | **무효 행동** | validity = INVALID 또는 절차 위반 |

배너 서식: `진술: "{진술}" ↔ 증거: {증거} [{헤드라인} — {상세}]`

#### 전면 판정 연출 (1200 ms)

| 판정 | 중앙 문구 | 색 · 크기 |
|---|---|---|
| `R_DIRECT_CONTRADICTION` | **직접 모순** | 적색 21 px |
| `R_INDIRECT_SUSPICION` | **의심** | 앰버 20 px |
| `R_INSUFFICIENT_GROUNDS` | **근거 부족** | 회색 13 px |
| `R_TRUTH_ATTACKED` | **진실 공격** | 시안 14 px |
| `R_IRRELEVANT_EVIDENCE` | **무관한 증거** | 회색 12 px |

공통으로 진행률 8 %까지 흰색 전면 플래시가 번쩍이고, 12.5 %까지 균열선이 페이드인합니다.

#### 징벌 연출 (강압 상승 시에만 · 총 900 ms)

```text
     0 ms  ─┬─ 붉은 전면 워시 #b03030 · 최대 α 0.25 · 300 ms 감쇠
            ├─ 화면 흔들림 300 ms · 진폭 4 px · 6회 진동 (x축 전용)
            ├─ 확산 링 2개 600 ms · 주기 300 ms · 최대 1.8배 · α 0.8
   100 ms   └─ "+N 강압" 12 px 적색 · 800 ms 동안 24 px 상승 · 500 ms부터 페이드
```

강압 증가량이 0 이하이면 **아예 재생되지 않습니다**(회복 카드는 조용합니다). 유물이 페널티를 상쇄해 게이지가 실제로 움직이지 않으면 연출도 나오지 않습니다.

#### 용의자 상태 전이 연출

| 상태 | 조건 | 초상 흔들림 | 추가 |
|---|---|---|---|
| `base` | 평정 비율 > 40 % | 400 ms · 10 px · 5회 | — |
| `upset` | 평정 비율 **≤ 40 %** | 400 ms · 10 px · 5회 | — |
| `lose` | 평정 ≤ 0 **또는 자백** | 550 ms · 12 px · 5회 | 화면 전체 400 ms 흔들림 + (320,142) 반경 48 px 적색 링 |

<div class="callout warn">
<span class="tag">알아두기</span>
자백 플래그는 <b>BEST 결말과 강제 자백 양쪽 모두</b>에서 참이 됩니다. 따라서 최선의 결말로 끝내도 용의자는 <code>lose</code> 스프라이트로 그려집니다.
</div>

### 2.5 승패 조건

결말은 **FAILED → COERCED_CONFESSION → BEST_RESOLUTION → PARTIAL_RESOLUTION** 순서로 평가됩니다.

| 결과 | 사유 코드 | 조건 |
|---|---|---|
| **FAILED** | `STRESS_DEPLETED` | 스트레스 ≤ 0 |
| **FAILED** | `COERCION_LIMIT_EXCEEDED` | 강압이 한계를 **초과**(같으면 안전) |
| **FAILED** | `TURN_LIMIT_EXCEEDED` | 턴이 제한을 초과 |
| **FAILED** | `NO_SOLVABLE_PATH` | 남은 증명 경로 소멸 |
| **COERCED_CONFESSION** | `COMPOSURE_DEPLETED` | 평정심 ≤ 0 — 허위 자백 1회 누적 |
| **BEST_RESOLUTION** | `BEST_CONFIRMED` | 아래 3조건 + **[진술 확보] 직접 클릭** |
| **PARTIAL_RESOLUTION** | `TURN_LIMIT_REACHED` | 턴이 제한에 도달 |

**BEST 3조건** — ① 필수 목표 전부 완료 ② 평정심이 스위트 스팟 구간 안(양끝 포함) ③ 강압 **40 이하**

#### 조우별 BEST 평정심 구간 (최대치의 1 % ~ 30 %)

| 대상 | 구간 | 대상 | 구간 | 대상 | 구간 |
|---|---|---|---|---|---|
| 물컹이 | 0.6 ~ 18 | 고블린 | 0.9 ~ 27 | 드워프 | 1.1 ~ 33 |
| 하피 | 0.7 ~ 21 | 오크 | 1.0 ~ 30 | 사이클롭스 | 1.2 ~ 36 |
| 미노타우로스 | 1.2 ~ 36 | 서큐버스 | 1.4 ~ 42 | 타락한 용사 | 1.8 ~ 54 |

### 2.6 파트너 스킬 & 쿨다운

```text
   ┌──────────┐        ┌──────────┐        ┌──────────┐        ┌──────────┐
   │   base   │ ────→  │  used 3  │ ────→  │  used 2  │ ────→  │  used 1  │
   └──────────┘        └──────────┘        └──────────┘        └──────────┘
         ^                                                            |
         +------------------------------------------------------------+

   base → used 3    파트너 스킬 사용 · 강압 −4
   used −1 / 턴     턴 시작마다 쿨다운 1 감소
   0 도달           자동으로 base 복귀 · 재사용 가능
```

쿨다운 중에는 아트가 α 0.7로 흐려지고 딥 잉크 α 0.62 딤이 덮이며, 중앙에 **남은 턴 수가 24 px 글자**로 표시됩니다. `used` 상태이거나 쿨다운이 남아 있으면 사용 요청은 무시됩니다.

### 2.7 조작 요약

#### 마우스 (주 입력)

| 조작 | 결과 |
|---|---|
| 카드에 **호버** | 29 px 상승 + 시안 테두리 |
| 카드 **클릭**(4 px 미만 이동) | 상세 모달 열기 |
| 카드 **드래그 → 태그 칩** | 카드 + 태그 동시 선택, 점선 링크 스냅 |
| 증거 파우치 슬롯 **클릭** | 조서 오버레이 열기 |
| 파트너 초상 **클릭** | 스킬 사용 (쿨다운 아닐 때만) |
| 모달 **바깥 클릭** | 모달 닫기 |

#### 키보드 (보조 입력)

<p>
<kbd>Space</kbd> 진행(ADVANCE) — 타자기 연출 즉시 완료<br>
<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd> N번째 카드 선택 (손패는 최대 5장이므로 <kbd>6</kbd>~<kbd>9</kbd>는 무효)<br>
<kbd>`</kbd> 개발자 콘솔 토글 <span class="chip">DEV 빌드 전용</span>
</p>

<div class="callout warn">
<span class="tag">흔한 오해</span>
제출 버튼 라벨은 <b>「제출 / RETURN」</b>이지만 <kbd>Enter</kbd> / <kbd>Return</kbd> 키는 어떤 핸들러에도 연결되어 있지 않습니다. 제출은 <b>버튼 클릭으로만</b> 가능합니다. <kbd>Esc</kbd>·방향키 바인딩도 존재하지 않습니다.
</div>

조서나 카드 상세 모달이 열려 있는 동안에는 <kbd>Space</kbd>·숫자 키가 완전히 차단되며, 입력 필드에 포커스가 있거나 키 반복(repeat) 이벤트도 무시됩니다.

### 2.8 비전투 이벤트 6패턴

| 패턴 | 유형 | 실제 노드 | 주요 조작 |
|---|---|---|---|
| **A** | 선택지 | 탕비실 야근 (노드 02) | 선택지 클릭 · 자원 부족 시 회색 처리 |
| **B** | 배치 | 사건 시간표 정리 (노드 04) | 항목 배치 후 `배치 제출` → 성공/부분 성공/실패 |
| **F** | 감식 | 감식반 동행 (노드 07) | 대상 수집 후 `감식 종료` |
| **C** | 조사 | 서쪽 창고 수색 (노드 09) | `조사 횟수 n/N` 소모, `조사 종료` |
| **D** | 강화 | 용맥 기관실 수색 (노드 12) | `강화 방식` × `대상 카드` → `강화 적용` |
| **E** | 탐문 | 암표상 탐문 (노드 14) | 주제별 탐문 후 `탐문 종료` |

컷신은 **BEFORE / AFTER** 두 타이밍이 있습니다. BEFORE 컷신의 선택은 이벤트 노드와 함께 커밋되어 결과를 바꾸지만, AFTER 컷신은 이미 커밋된 뒤에 재생되므로 **서사 전용**입니다. 연출은 `NONE` · `FADE_IN` · `FADE_OUT` · `SHAKE` · `FLASH` · `SLOW_FADE` 6종이며, 저작 데이터가 허용한 경우에만 `건너뛰기` 버튼이 제공됩니다.

### 2.9 실패 · 등급 · 엔딩

#### 데드 신 4종

| 사유 | 제목 | 원인 문구 |
|---|---|---|
| `STRESS_DEPLETED` | **형사 김태훈, 쓰러지다** | 며칠째 이어진 심문이 한계를 넘었다. 조서를 쥔 손이 먼저 풀렸다. |
| `COERCION_LIMIT_EXCEEDED` | **수사권 박탈** | 강압의 기록이 감찰에 닿았다. 진술이 아니라 수사관이 심판대에 올랐다. |
| `TURN_LIMIT_EXCEEDED` | **구속 시한 만료** | 시계가 먼저 답을 내렸다. 문이 열리고, 용의자는 걸어 나갔다. |
| `NO_SOLVABLE_PATH` | **미제 사건** | 남은 증거로는 어떤 진술도 무너뜨릴 수 없다. 조서는 이대로 봉인된다. |

데드 신은 5개 통계(도달 노드 n/15 · 해결한 노드 · 확보 증거 · 누적 강압 · **남은 재시도 n/2**)와 2개 행동(`재시도` / `진행 기록으로`)을 표시합니다. 런 전체 **재시도 한도는 2회**이며, 재시도가 승인되면 스트레스가 최소 60까지 회복되고 노드 인덱스는 전진하지 않습니다.

#### 사건 등급 6단계

| 등급 | 라벨 | 필수 해결률 | 선택 목표 | 스위트 스팟 | 강압 | 허위 자백 |
|---|---|---|---|---|---|---|
| **S** | 완전 입증 | 100 % | 100 % | 필수 + 원본 보존 | ≤ 10 | 0 |
| **A** | 우수 입증 | 100 % | — | 필수 | ≤ 25 | 0 |
| **B** | 성실 수사 | 80 % | — | — | ≤ 40 | 0 |
| **C** | 미흡 수사 | 60 % | — | — | ≤ 60 | ≤ 1 |
| **D** | 부실 수사 | 30 % | — | — | 제한 없음 | ≤ 2 |
| **F** | 수사 실패 | 0 % | — | — | — | — |

#### 엔딩 3종

| 엔딩 | 제목 | 논조 | 조건 |
|---|---|---|---|
| `ending-true` | **완전한 조서** | 진실은 기록으로 남았다. | **F-13** 성립 + 허위 자백 0 + 런 실패 0 |
| `ending-normal` | **마감된 조서** | 수사는 끝났지만 의문은 남았다. | 기본값 |
| `ending-bad` | **찢긴 조서** | 조서는 끝내 진실에 닿지 못했다. | 허위 자백 또는 런 실패 발생 |

<div class="callout">
<span class="tag">트루 엔딩 진입 조건</span>
플래그 <b>F-13</b>은 최종 보스 <b>타락한 용사</b>를 <code>BEST_RESOLUTION</code>으로 끝냈을 때만 세팅됩니다. 즉 트루 엔딩의 유일한 관문은 <b>최종 심문을 BEST로 마감하는 것</b>이며, 그 과정에서 단 한 번의 허위 자백도 없어야 합니다.
</div>

엔딩 화면의 `조서 닫기`는 저장 데이터를 완전히 삭제한 뒤 새 런을 시작합니다 — 이어하기가 아니라 **완전 초기화**입니다.

#### 저장

세이브는 브라우저 `localStorage`의 **`dungeon-dossier.save`** 키 한 곳에만, **노드 경계마다 자동으로** 저장됩니다(수동 저장 UI 없음). 모든 커밋은 저장이 성공한 뒤에만 메모리 상태를 교체하므로 저장 실패 시 이전 상태가 그대로 남습니다.

<div class="callout warn">
<span class="tag">주의</span>
<b>심문 진행 중 상태는 저장되지 않습니다.</b> 조우 도중 새로고침하면 그 조우는 처음부터 다시 시작합니다.
</div>

---

## SECTION 3. 실행 방법 & 접속 모드

### 3.1 요구 환경

| 항목 | 요구 사항 | 확인 명령 |
|---|---|---|
| **Node.js** | `>= 22.13.0 < 23` (`.nvmrc` = 22.13.0) | `node -v` |
| **패키지 매니저** | **pnpm 11.18.0** (corepack 고정) | `pnpm --version` |
| **브라우저** | Chrome 최신 | — |

<div class="callout warn">
<span class="tag">npm으로는 설치하지 마십시오</span>
저장소에는 <code>pnpm-lock.yaml</code>만 있고 <code>package-lock.json</code>은 없습니다. 따라서 <code>npm ci</code>는 즉시 실패하고 <code>npm install</code>은 락파일을 무시해 다른 의존성 트리를 만듭니다. 또한 <code>check</code> 스크립트는 본문에서 <code>pnpm</code>을 8회 직접 호출하므로 <code>npm run check</code>로도 pnpm이 필요합니다. <b>반드시 corepack + pnpm 경로를 쓰십시오.</b>
</div>

### 3.2 설치 및 개발 서버 실행

```bash
# 1) 저장소 루트에서 게임 디렉터리로 이동
cd dungeon-dossier

# 2) corepack으로 pnpm 11.18.0 활성화 (최초 1회)
corepack enable

# 3) 잠긴 버전 그대로 의존성 설치
pnpm install --frozen-lockfile

# 4) 개발 서버 기동
pnpm dev
```

`pnpm dev`가 출력하는 **Local URL을 그대로 사용**하십시오.

<div class="callout info">
<span class="tag">포트에 대하여</span>
<code>vite.config.ts</code>의 <code>server</code> 블록에는 <b><code>port</code> 키가 아예 없습니다.</b> 따라서 실제 포트는 Vite 기본값 <b>5173</b>이며, 5173이 이미 점유되어 있을 때만 Vite가 자동으로 5174로 넘어갑니다. 저장소 전체 grep에서 "5174"는 <b>0건</b>입니다. 아래 URL은 5173 기준으로 표기하되, <b>dev server가 출력한 포트를 우선</b>하십시오.
</div>

### 3.3 접속 모드 URL

| 모드 | URL | 용도 |
|---|---|---|
| 🎮 **메인 게임** | `http://localhost:5173/` | 일반 플레이 |
| 🎬 **무인 시네마틱 완주** | `http://localhost:5173/?autoplay=true&mode=video` | 촬영·시연 (약 150초) |
| ⚡ **고속 자동 검증** | `http://localhost:5173/?autoplay=1&mode=turbo` | 회귀 확인 (20× 배속) |
| 👁 **실시간 관전** | `http://localhost:5173/?autoplay=1&mode=watch` | 동작 확인 (1× 배속) |
| 🛠 **에셋 워크벤치** | `http://localhost:5173/workbench/` | 기획자용 애셋 튜닝 |

스크립트로 바로 열 수도 있습니다.

```bash
pnpm autoplay          # /?autoplay=1&mode=watch  로 브라우저 자동 오픈
pnpm autoplay:video    # /?autoplay=true&mode=video 로 브라우저 자동 오픈
```

#### 쿼리 파라미터 전수표

앱이 시작 시 읽는 파라미터는 **정확히 4개**입니다.

| 파라미터 | 허용 값 | 기본값 | 비고 |
|---|---|---|---|
| `autoplay` | `false` · `0` 이외의 **모든 값** | (없음 = 꺼짐) | **DEV 빌드에서만** 동작 |
| `mode` | `watch` · `turbo` · `record` · `video` | `turbo` | 오타 시 경고 후 기본값 |
| `policy` | `best` · `partial` · `coerced` · `greedy` · `fuzz` | `best` | 오타 시 경고 후 기본값 |
| `seed` | 부호 없는 32비트 10진 정수 (0 ~ 4294967295) | `20260803` | 소수·음수·지수표기는 무시 |

<div class="callout info">
<span class="tag">결정론 보장</span>
오토플레이가 요청되면 <b>실행 세이브만</b> 폐기해 매번 같은 결과가 나오도록 합니다. 워크벤치의 좌표·잠금 등 다른 <code>localStorage</code> 값은 보존됩니다.
</div>

#### mode 4종 비교

| mode | 시간 배율 | 액션 간격 | 타자기 | 런 타임아웃 | 용도 |
|---|---|---|---|---|---|
| `watch` | 1× | 600 ms | 재생 | 1200 s | 실시간 관전 |
| `turbo` | **20×** | 30 ms | **건너뜀** | 120 s | 고속 회귀 |
| `record` | 5× | 250 ms | 재생 | 600 s | 중속 기록 |
| **`video`** | **1.15×** | **950 ms** | 재생 (20 ms/자) | 360 s | **촬영용** |

### 3.4 촬영용 시네마틱 모드 (`mode=video`)

```text
  목표 길이  150초  (VIDEO_TARGET_DURATION_SEC)
  허용 오차  ±15초  (VIDEO_DURATION_TOLERANCE_SEC)
  ─────────────────────────────────────────────────────
  합격 구간  135,000 ms ~ 165,000 ms   측정 방식: L2_WALL_CLOCK
```

<div class="callout warn">
<span class="tag">합격 기준 해석</span>
"150초 <b>이내</b>"가 아니라 <b>"약 150초, ±15초"</b>입니다. 130초에 끝나도 <b>불합격</b>입니다. 이 해석은 테스트로 잠겨 있습니다.
</div>

페이싱은 노드 게이트로 강제됩니다. 노드 개수는 15개로 고정이고, **노드 n은 `n × 10,000 ms` 이전에는 스트립을 떠날 수 없습니다.** 빠르게 끝난 노드도 예산에 맞춰 대기합니다.

`video` 모드에서만 화면 상단에 시네마틱 배너가 뜨고 코너 디버그 패널은 숨습니다.

```text
  🎬 15-NODE CINEMATIC DEMO  |  NODE 01 / 15: …
  ✅ 수사 완료 — 자백 확보 성공          (완주 시)
```

### 3.5 프로젝트 스크립트 21종

| 명령 | 역할 |
|---|---|
| `pnpm dev` | 개발 서버 |
| `pnpm build` | 프로덕션 빌드 + `content/`·`assets/`·`schemas/` 복사 |
| `pnpm typecheck` | 브라우저·Node TypeScript strict 검사 |
| `pnpm lint` | ESLint + 엔진 금지 API 검사 (`--max-warnings 0`) |
| `pnpm arch` | dependency-cruiser 계층 검사 |
| `pnpm test` | Vitest 회귀 검사 |
| `pnpm test:gates` | PR용 14개 디렉터리 게이트 |
| `pnpm test:e2e` | E2E 단위 검사 |
| `pnpm content:validate` | Zod 스키마 + T1~T3 의미·도달성·누설 검사 |
| `pnpm placeholder:generate` | 누락 애셋용 16색 실루엣 PNG 생성 (기존 파일 보존) |
| `pnpm schema:export` | Zod 단일 원본 → Draft 2020-12 JSON Schema 생성 |
| `pnpm palette:check` | PNG당 보이는 RGBA 16색 제한 검사 |
| `pnpm simulate:smoke` | BEST·플래그·결정론 리플레이 스모크 |
| `pnpm simulate:full` | 9조우 × 3결과 27셀 전체 (nightly) |
| `pnpm check` | 위 게이트 8종 일괄 실행 |
| `pnpm autoplay` / `autoplay:video` | 오토플레이 URL로 브라우저 자동 오픈 |
| `pnpm e2e:install` / `e2e:browser` / `e2e:browser:turbo` | Playwright 브라우저 E2E |

### 3.6 Vite 504 (Outdated Optimize Dep) 대처

#### 원인

Vite는 `howler` · `pixi.js` · `zod`를 `node_modules/.vite/deps/`에 해시 URL로 사전 번들링합니다. 설정이나 의존성이 바뀌면 Vite가 이전 해시를 폐기하는데, **열려 있던 브라우저 탭이 옛 해시 URL을 계속 요청**하면 HTTP **504 (Outdated Optimize Dep)** 가 발생해 스크립트 로드가 차단됩니다.

#### 즉시 조치

```bash
# ① 브라우저에서 강제 새로고침
#    Ctrl + F5   또는   Ctrl + Shift + R

# ② 그래도 안 되면 사전 번들 캐시 재구축
cd dungeon-dossier
npx vite --force
```

#### 영구 방지책 (이미 적용됨)

```typescript
// dungeon-dossier/vite.config.ts
optimizeDeps: {
  include: ["howler", "pixi.js", "zod"],
  holdUntilCrawlEnd: true,
},
```

`include`에 나열된 3개는 `package.json`의 런타임 의존성 3개와 정확히 일치합니다. 모든 런타임 의존성을 사전 번들 대상으로 **명시**해, 스캐너가 뒤늦게 새 의존성을 발견하며 해시를 재생성하는 일 자체를 없앤 것이 실질적인 해결책입니다.

<div class="callout info">
<span class="tag">참고</span>
설치된 Vite 8.2.0에서 <code>holdUntilCrawlEnd</code>의 기본값은 이미 <code>true</code>이므로 명시 지정은 동작상 no-op이며, 문서화 목적의 의도 표명입니다.
</div>

### 3.7 개발자 콘솔 (DEV 빌드 전용)

게임 화면에서 <kbd>`</kbd> (백틱)을 누르면 개발자 콘솔이 열립니다. 이 키 외의 단축키는 콘솔을 열지 않으며, **프로덕션 빌드에는 콘솔 모듈·스타일·truth overlay가 물리적으로 포함되지 않습니다**(Vite 빌드 플러그인이 번들 생성 시 이를 검사해 위반 시 빌드를 실패시킵니다).

| 탭 | 기능 |
|---|---|
| **라이브 밸런스** | `balance.json` 전체 카탈로그 편집 → Zod 검증 → **현재 턴에 즉시 적용** · JSON 내려받기 · 디스크 스냅샷과의 차이 표시 |
| **사건·대사** | Claim, Evidence 범위, ReactionKey 편집 · 무대 타이프라이터 재생 · 실시간 검사 |
| **QA** | production resolver로 12개 게이트 픽스처 개별/일괄 재생, 결과 코드 + 5개 판정 축 단언 |
| **런타임** | 자원 치트 · 노드 점프 · **AI 즉시 on/off** · QTE 자동 성공 · F-01~F-13 플래그 · truth overlay |
| **로그** | `JudgmentLog` 확인 · 초기화 · JSON 내보내기 |

`JSON 내보내기`는 파일을 **내려받을 뿐** 저장소의 `content/common/balance.json`을 덮어쓰지 않습니다. 내려받은 파일을 검토해 저장소로 옮길 때까지 diff 표시가 유지됩니다.

#### AI 대사 파이프라인

| 항목 | 값 |
|---|---|
| 프로바이더 체인 | ① 사전 검증 캐시 → ② 라이브 프록시(**최대 2회 시도**) → ③ 사전 작성 폴백 |
| 타임아웃 | **2,500 ms** / 시도 (초안 수치) — 최악 대기 5,000 ms |
| 출력 검증 | **7단계** — JSON_SCHEMA · CLAIM_MAPPING · ATOMICITY · SPAN_INTEGRITY · ALLOWED_INFORMATION · FORBIDDEN_EXPRESSIONS · STYLE_CONSISTENCY |
| AI가 보는 정보 | `speaker_profile` · `allowed_claims` · `presentation_groups` · `forbidden_information` · `seed` **뿐** |
| 평정심 전달 방식 | 수치가 아닌 **HIGH / MID / LOW / CRITICAL 4밴드** |
| 기본 상태 | **정적·프로덕션 빌드에서 강제 OFF**. DEV에서도 기본 OFF, 개발자 콘솔 토글로만 활성화 |
| API 키 | **브라우저에 담을 방법이 타입 수준에서 존재하지 않음**(인증 헤더 없음) |
| 로그 분리 | AI 메타데이터는 `GenerationLog`에만. `JudgmentLog`에 들어가면 예외로 거부 |

<div class="callout info">
<span class="tag">누설 방지 설계</span>
진실 관계·입증 규칙·가설·자원 수치는 <b>AI 요청 타입에 필드 자체가 없습니다.</b> "필터링"이 아니라 <b>"표현 불가능(not representable)"</b> 설계이므로 실수로도 담을 수 없습니다.
</div>

라이브 AI를 쓰려면 동일 출처 프록시(`/api/dialogue`)를 **별도로 준비**해야 합니다 — 이 저장소에는 프록시 서버 구현이 포함되어 있지 않습니다. 프롬프트 실패율이 **10 %** 를 초과하면 검증기를 완화하지 않고 프롬프트를 수정하는 것이 정책입니다.

---

## SECTION 4. 기획자용 에셋 워크벤치 매뉴얼

### 4.1 개요

> **접속**: `http://localhost:5173/workbench/` — 게임 런타임에 import되지 않는 **별도 Vite 진입점**입니다.

워크벤치는 기획자가 **코드를 만지지 않고** PNG를 교체하고, 화면 위에서 직접 좌표·회전·크기를 확정하고, 그 결과를 프로젝트 `assets/` 폴더에 1클릭으로 저장하는 도구입니다. 스테이지 내부 좌표는 항상 640 × 400이며, 상단바의 **표시 배율**을 `2× HD`로 두면 CSS `transform: scale(2)`로 1280 × 800 프레임에 표시됩니다(기본값 `2× HD`).

#### 화면 구성

| 패널 | 제목 | 내용 |
|---|---|---|
| 01 | COMPOSITION STAGE | 16개 슬롯이 배치된 실제 화면 구성 |
| 02 | SLOT INSPECTOR | 선택 슬롯의 이미지·잠금·좌표 |
| 03 | CHARACTER PARTS | 캐릭터 12명의 512×512 시트 교체 |
| 04 | SUSPECT STATE PARTS | 용의자 상태 파츠 오프셋 |
| 05 | ASSET MANIFEST | `asset_manifest.json` 미리보기 |
| 06 | 16 ASSET SLOTS | 슬롯 전체 목록·채움 상태 |

### 4.2 16개 애셋 슬롯

<div class="callout">
<span class="tag">중요</span>
<b>요구 PNG 크기는 1280 × 800 HD 원본 픽셀 기준</b>이고, <b>기본 배치는 640 × 400 레이아웃 그리드 기준</b>입니다. 두 값이 다른 것은 정상입니다 — 예를 들어 평정심 아이콘은 화면에 16 px로 그려지지만 저작 PNG는 <b>32 × 32</b>여야 합니다.
</div>

| # | 슬롯 ID | 라벨 | 요구 PNG | 기본 배치 (x, y, w, h) | 저장 파일명 |
|---|---|---|---|---|---|
| 1 | `bg-room` | 취조실 배경 | **1280×800** | 0, 0, 640, 400 | `배경_심문실_시안.png` |
| 2 | `suspect-base` | 용의자 베이스 | 512×512 | 212, 34, 216, 216 | `portrait_용의자_base.png` |
| 3 | `suspect-state-parts` | 용의자 동요 파츠 | 512×512 | 212, 34, 216, 216 | `portrait_용의자_upset.png` |
| 4 | `suspect-lose-parts` | 용의자 패배 파츠 | 512×512 | 212, 34, 216, 216 | `portrait_용의자_lose.png` |
| 5 | `fg-desk` | 책상 전경 | **1280×321** | 0, 239, 640, **161** | `전경_책상_기본.png` |
| 6 | `card-base` | 카드 베이스 | **640×725** | 256, 371, 128, 145 | `card_기본_템플릿.png` |
| 7 | `card-art-1` | 카드 일러스트 1 (질문) | 256×256 | 176, 336, 64, 64 | `card_질문_일러.png` |
| 8 | `card-art-2` | 카드 일러스트 2 (모순) | 256×256 | 248, 336, 64, 64 | `card_모순_일러.png` |
| 9 | `card-art-3` | 카드 일러스트 3 (압박) | 256×256 | 320, 336, 64, 64 | `card_압박_일러.png` |
| 10 | `ev-1` | 증거 1 | 128×128 | 12, 306, 36, 36 | `ev_사건_증거1.png` |
| 11 | `ev-2` | 증거 2 | 128×128 | 52, 306, 36, 36 | `ev_사건_증거2.png` |
| 12 | `ev-3` | 증거 3 | 128×128 | 92, 306, 36, 36 | `ev_사건_증거3.png` |
| 13 | `icon-composure` | 평정심 아이콘 | **32×32** | 139, 5, 16, 16 | `아이콘_평정심_기본.png` |
| 14 | `icon-coercion` | 강압 아이콘 | **32×32** | 326, 5, 16, 16 | `아이콘_강압_기본.png` |
| 15 | `partner-base` | 파트너 · 활성 | 512×512 | 546, 296, 88, 88 | `portrait_김_인턴_base.png` |
| 16 | `partner-used` | 파트너 · 쿨다운 | 512×512 | 546, 296, 88, 88 | `portrait_김_인턴_used.png` |

<div class="callout info">
<span class="tag">fg-desk의 예외</span>
<code>fg-desk</code>는 16개 중 <b>유일하게 비율 잠금이 해제</b>된 슬롯입니다. 원본 1280 × 321을 2로 나누면 160.5라 640 × 400 격자에서 정수 높이가 나오지 않으므로, 바닥에 1 px 틈이 생기지 않도록 <b>640 × 161로 의도적으로 절상</b>했습니다.
</div>

### 4.3 PNG 업로드

세 가지 방법이 있습니다.

1. **드래그 앤 드롭** — PNG 파일을 슬롯 위로 끌어다 놓기 (가장 빠름)
2. **슬롯 클릭** — 슬롯을 클릭하거나 <kbd>Enter</kbd> / <kbd>Space</kbd> → 파일 선택창
3. **인스펙터** — 02 패널의 `PNG 선택` 버튼

<div class="callout warn">
<span class="tag">Tweak Mode가 켜져 있을 때</span>
슬롯 클릭이 <b>파일 선택창을 열지 않고 선택만</b> 합니다. 이미지를 바꾸려면 드래그 앤 드롭 또는 <code>PNG 선택</code> 버튼을 쓰십시오.
</div>

#### 업로드 검증 (3중)

| 검사 | 실패 시 메시지 |
|---|---|
| 확장자 `.png` | `PNG 파일만 사용할 수 있습니다.` |
| MIME `image/png` | `파일 형식이 image/png가 아닙니다.` |
| 픽셀 크기 일치 | `{W}×{H}px PNG가 필요합니다. (선택: {실제W}×{실제H}px)` |

오류는 슬롯 위에 **3.2초간** 표시됩니다. 크기 판정은 PNG IHDR 헤더 앞 24바이트만 읽어 즉시 수행합니다.

#### 인스펙터 이미지 버튼

| 버튼 | 동작 |
|---|---|
| `PNG 선택` | 파일 선택창 |
| `PNG 저장` | 규격 파일명으로 브라우저 다운로드 |
| `비우기` | 슬롯 초기화 |

이미지가 없는 슬롯에서는 `PNG 저장`과 `비우기`가 비활성화됩니다.

### 4.4 기즈모 조작 (Tweak Mode)

상단바의 **Tweak Mode** 체크박스(부제: *드래그로 이동·회전·크기*)를 켜면 기즈모가 나타나고 좌표 입력이 활성화됩니다.

```text
                  o──── 회전 핸들 (data-gizmo="rotate")
                  │
      ┌───────────┴─────────┐
      │                     │ ← 본체를 드래그하면 이동 (전용 핸들 없음)
      │        SLOT         │
      │                     │
      └─────────────────────o ← 크기 핸들 (data-gizmo="scale")
                              회전된 사각형의 보이는 좌상단이 고정점
```

드래그 모드는 `move` · `rotate` · `scale` 3종이며, 드래그 중에는 미리보기만 하고 **포인터를 놓을 때 `localStorage`에 커밋**합니다.

#### 좌표 입력 필드 7종

각 필드는 좌우에 `−` / `+` 버튼이 붙어 **1단위씩**(회전은 1도, 스케일은 1 %) 증감합니다.

| 라벨 | 의미 | 비고 |
|---|---|---|
| **X** / **Y** | 좌상단 원점 | 정수 |
| **W** / **H** | 표시 폭·높이 | `customWidth` / `customHeight`에 대응 |
| **R°** | 회전 | 매니페스트에는 라디안으로 기록 |
| **SX%** / **SY%** | 가로·세로 배율 | **100 % = 원본 PNG 해상도 그대로** |

#### 비율 유지 · 정렬 · 초기화

| 컨트롤 | 동작 |
|---|---|
| **비율 유지** (기본 체크) | W나 H 한쪽만 입력해도 나머지가 원본 비율로 자동 계산 |
| 비율 왜곡 배지 | 왜곡이 **2 %** 를 넘으면 `비율 왜곡 X.X%` 표시 (경고일 뿐 빌드는 실패하지 않음) |
| `스테이지 안으로 맞춤` | 원점을 x 0~639 · y 0~399로 제한. **폭·높이가 우측·하단을 넘는 것은 허용**(카드 손패는 의도적으로 화면 밖) |
| `선택 좌표 초기화` | 현재 슬롯만 기본값으로 |
| `전체 좌표 초기화` | 16슬롯 전부 기본값으로 |

#### 잠금

| 버튼 상태 | 라벨 | 상태 표시 |
|---|---|---|
| 잠기지 않음 | `확정 / 고정` | 자유 편집 |
| 잠김 | `고정 해제` | **고정됨 · 드래그 차단** |

잠긴 슬롯은 좌표·회전·크기 변경이 전부 무시되고 기즈모 핸들도 사라집니다.

### 4.5 캐릭터 파츠 (03 패널)

캐릭터 **12명**의 512 × 512 시트를 교체합니다 — 물컹이(기본 선택) · 하피 · 미노타우로스 · 고블린 · 오크 · 서큐버스 · 드워프 · 사이클롭스 · 켄타우로스 · 타락한\_용사 · 김태훈 · 김\_인턴.

파츠 이름은 `base` · `upset` · `lose` · `used` 4종이지만, **`used`는 파트너 김\_인턴에게만** 존재하고 나머지 11명은 3장씩입니다. 현재 저장소에는 **12캐릭터 · PNG 37장**이 들어 있습니다.

#### 파일명 규칙

```text
  PNG      portrait_<캐릭터>_<파트>.png        예: portrait_물컹이_base.png
  사이드카  portrait_<캐릭터>.state-parts.json  예: portrait_물컹이.state-parts.json
```

#### 사이드카 JSON

`사이드카 내보내기` / `사이드카 가져오기` 버튼으로 오프셋만 주고받습니다. **JSON에는 PNG가 들어 있지 않으므로**, 가져오기 후 이미지는 별도로 다시 드롭해야 합니다. `schema_version`이 정확히 `"2.0"`이 아니면 거부됩니다.

```json
{
  "schema_version": "2.0",
  "base": {
    "slot": "suspect-base",
    "image": "portrait_물컹이_base.png",
    "width": 512, "height": 512
  },
  "state_parts": [
    { "state": "upset", "slot": "suspect-state-parts",
      "image": "portrait_물컹이_upset.png",
      "origin": "suspect-base", "x": 0, "y": 0, "width": 512, "height": 512 },
    { "state": "lose",  "slot": "suspect-state-parts",
      "image": "portrait_물컹이_lose.png",
      "origin": "suspect-base", "x": 0, "y": 0, "width": 512, "height": 512 }
  ]
}
```

오프셋은 512 × 512 base 프레임 기준의 저작 공간 픽셀이며 ±512로 클램프됩니다. 오프셋 입력은 `upset` · `lose` 두 파츠에만 표시됩니다.

### 4.6 PM 1클릭 파일 직저장

상단바의 **`💾 프로젝트 assets/ 에 직접 저장`** 버튼을 누르면, 채워진 슬롯의 PNG와 `asset_manifest.json`이 개발 서버를 통해 **프로젝트 폴더에 직접 기록**됩니다.

```text
   [ 💾 프로젝트 assets/ 에 직접 저장 ]        워크벤치 상단바
         │
         │   채워진 슬롯의 PNG + asset_manifest.json · 중복 제거 후 경로순 정렬
         ↓
   POST /api/workbench/save                   Vite 개발 서버 플러그인 (apply: 'serve')
         │
         │   ① POST 검사   ② Host 루프백 검사   ③ sec-fetch-site 검사
         │   ④ 경로·폴더   ⑤ PNG 시그니처      ⑥ 16색 팔레트
         ↓
   원자적 쓰기 (임시파일 → rename)             동일 내용은 건너뛰고 skippedFiles 보고
         ↓
   assets/{bg,cards,dead,evidence,fg,portraits,ui}/*.png
   assets/asset_manifest.json
```

성공 시 상태 표시줄:

> ✅ PM 알림: **N**개 에셋이 `dungeon-dossier/assets/` 에 저장되었습니다. **게임 탭은 새로고침해야 반영됩니다.**

디스크 내용이 동일한 파일은 건너뛰고 `skippedFiles`로 보고합니다.

#### 저장 폴더 라우팅 (파일명 첫 토막이 결정)

| 파일명 접두 | 저장 폴더 | 예시 |
|---|---|---|
| `배경_` | `assets/bg/` | `배경_심문실_시안.png` |
| `전경_` | `assets/fg/` | `전경_책상_기본.png` |
| `portrait_` | `assets/portraits/` | `portrait_물컹이_base.png` |
| `card_` | `assets/cards/` | `card_기본_템플릿.png` |
| `ev_` | `assets/evidence/` | `ev_사건_증거1.png` |
| `아이콘_` · `placeholder_` | `assets/ui/` | `아이콘_평정심_기본.png` |
| `dead_` | `assets/dead/` | — |

<div class="callout warn">
<span class="tag">라우팅은 필수입니다</span>
<code>assets/</code> 루트에 파일을 두면 폴더 버전과 <b>레지스트리 키가 충돌해 게임이 부팅되지 않습니다.</b> 미관 문제가 아니라 동작 조건입니다.
</div>

#### 네트워크 안전장치 3중

개발 서버가 `host: true`로 LAN에 열려 있으므로, 임의 파일 쓰기를 개발자 자신의 머신에 묶어 두는 검사가 필수입니다.

| 검사 | 실패 시 |
|---|---|
| HTTP 메서드 | `405` — `POST 요청만 지원합니다.` |
| Host 헤더가 루프백(`localhost` / `127.0.0.1` / `[::1]`)인가 | `403 E_REMOTE` — `로컬 개발 서버에서만 저장할 수 있습니다.` |
| `sec-fetch-site`가 `same-origin` 또는 `none`인가 | `403` — `동일 출처 요청만 허용합니다.` |

또한 이 플러그인은 `apply: 'serve'`로 선언되어 **프로덕션 빌드(`dist/`)에는 단 한 바이트도 포함되지 않습니다.**

#### 저장 오류 코드 전수표

| 코드 | 의미 | 조치 |
|---|---|---|
| `E_METHOD` | POST가 아님 | — |
| `E_REMOTE` | 원격 호스트에서 요청 | localhost로 접속 |
| `E_BODY_TOO_LARGE` | 본문 **64 MB** 초과 | 슬롯을 나눠 저장 |
| `E_JSON` / `E_SCHEMA` | 본문 파싱·스키마 실패 | — |
| `E_DUPLICATE` | 같은 경로 중복 | — |
| `E_FLAT_WRITE` | `assets/` 루트 직접 쓰기 | 폴더 라우팅 확인 |
| `E_DIR` | 허용 폴더(7종) 밖 | `bg`·`cards`·`dead`·`evidence`·`fg`·`portraits`·`ui`만 가능 |
| `E_PROTECTED` | `ui/placeholder_missing_fallback.png` 덮어쓰기 시도 | 보호 대상 |
| `E_PATH` | 경로 이탈(`..`·절대경로) | — |
| `E_FILENAME` | `카테고리_이름_상태.png` 형식 위반 | 밑줄 3토막 이상 필요 |
| `E_DATA_URL` / `E_NOT_PNG` | PNG data URL이 아님 | — |
| **`E_PALETTE`** | **불투명 RGBA 색이 16색 초과** | 16색 이하로 감축 |
| `E_WRITE` | 디스크 쓰기 실패 | 권한 확인 |

<div class="callout">
<span class="tag">16색 팔레트 제약</span>
알파가 0이 아닌 픽셀의 서로 다른 RGBA 색이 <b>16개를 넘으면 저장이 거부</b>됩니다. 이는 CI 게이트 <code>pnpm palette:check</code>와 <b>동일한 상한</b>이므로, 워크벤치에서 저장에 성공한 PNG는 CI 팔레트 검사도 통과합니다.
</div>

#### 파일 개수·용량 한도

| 항목 | 한도 |
|---|---|
| 요청 본문 | 64 MB |
| 파일 개수 | 256개 |

### 4.7 저장 상태와 매니페스트

업로드한 PNG와 모든 배치 상태는 브라우저 `localStorage`의 **단일 키 `dungeon-dossier.asset-workbench.v2`** 에만 저장됩니다.

`asset_manifest.json`(스키마 `3.0`)의 stage 블록은 다음 값으로 고정됩니다.

```json
"stage": {
  "width": 640, "height": 400,
  "render_width": 1280, "render_height": 800,
  "render_scale": 2
}
```

각 슬롯은 `dimension`, `image`(파일명 또는 `null`), `transform { x, y, rotation, scaleX, scaleY, preserveAspectRatio, customWidth?, customHeight? }`, `isLocked`를 가집니다.

<div class="callout warn">
<span class="tag">게임 부팅과의 관계</span>
게임 런타임은 <b><code>asset_manifest.json</code>을 읽지 않습니다.</b> 런타임 레지스트리는 <code>import.meta.glob('assets/**/*.png')</code>로 PNG만 수집해 <b>파일명에서 슬롯 키를 유도</b>합니다. 매니페스트와 <code>.state-parts.json</code> 사이드카는 <b>기획 산출물</b>이지 게임 부팅 입력이 아닙니다. 따라서 화면에 반영하려면 <b>파일명 규칙을 반드시 지켜야</b> 합니다.
</div>

---

## 부록 A. 판정 코드 21종

| 코드 | 한국어 | 상태 전이 / 효과 |
|---|---|---|
| `R_DIRECT_CONTRADICTION` | **직접 모순** | epistemic → `REFUTED` · 평정심 **−18**(COMMITTED 시 −25.2) |
| `R_INDIRECT_SUSPICION` | **정황 포착** | epistemic → `SUSPECTED` · 평정심 **−4** |
| `R_INSUFFICIENT_GROUNDS` | **근거 부족** | 강압 **+2** |
| `R_TRUTH_ATTACKED` | **진실 공격** | epistemic → `PROVISIONAL` · 강압 **+15** |
| `R_IRRELEVANT_EVIDENCE` | **무관한 증거** | 강압 **+5** |
| `R_CONFIRM_LOCKED` | 확정 | epistemic → `SUPPORTED` |
| `R_CONFIRM_PROVISIONAL` | 잠정 확인 | epistemic → `PROVISIONAL` |
| `R_CONFIRM_CONFLICT` | 확인 충돌 | epistemic → `SUSPECTED` |
| `R_QUERY_SUCCESS` / `R_QUERY_BLOCKED` | 질문 성공 / 차단 | 차단 시 **CP 소모 없음** |
| `R_CLARIFY_SUCCESS` / `R_CLARIFY_NOOP` | 해명 성공 / 무변화 | — |
| `R_COMMIT_SUCCESS` / `R_COMMIT_REFUSED` | 확약 성공 / 거부 | 성공 시 commitment → `COMMITTED` |
| `R_FORENSIC_REVEALED` | 감식 결과 공개 | — |
| `R_PRESSURE_APPLIED` / `R_PRESSURE_BACKFIRE` | 압박 적용 / 역효과 | 역효과 시 저항 +1 |
| `R_RECOVER_APPLIED` | 회복 적용 | — |
| `R_SPECIAL_APPLIED` | 특수 적용 | — |
| `R_ACTION_INVALID` | 무효 행동 | **CP 소모 없음** · 효과 미적용 |
| `R_PROCEDURE_VIOLATION` | **절차 위반** | **즉시 조우 실패**(terminalOutcome = FAILED) |

효과는 항상 **6단계 고정 순서**로 적용됩니다: `RESOURCES → STATE → REVEALS → CARD_EFFECTS → MODIFIERS → OBJECTIVE_CHECK`.

## 부록 B. 밸런스 수치 (`content/common/balance.json`)

| 항목 | 값 | 게임 로직 사용 |
|---|---|---|
| `draw.initial` / `perTurn` / `handLimit` | 5 / 1 / 7 | ✔ 손패가 7이면 그 턴은 드로우 없음 |
| `draw.reshuffleOnEmpty` | `true` | ✔ 버린 더미 재섞기 |
| `stress.max` | 100 | ✔ 전역(조우별 오버라이드 불가) |
| `dmg.contradict` | 18 | ✔ 직접 모순 평정심 피해 |
| `composureDmg.indirect` | 4 | ✔ 정황 포착 평정심 피해 |
| `committedMultiplier` | 1.4 | ✔ COMMITTED 대상 배수 |
| `coercion.insufficient` | 2 | ✔ 근거 부족 |
| `coercion.truthAttack` | 15 | ✔ 진실 공격 |
| `coercion.irrelevant` | 5 | ✔ 무관한 증거 |
| `coercion.breathReduce` | 4 | ✔ 파트너 스킬 강압 감소 |
| `independence.partialWeight` | 0.5 | ✔ 같은 그룹 2번째 출처는 1.5 → 내림 1 |
| `partner.cooldowns.skill_kim_intern_note` | 3 | ✔ 파트너 쿨다운 |
| `sweetSpot.min` / `max` | 1 / 30 | ✔ **평정심 최대치의 백분율** |
| `trust.max` / `thresholds` | 3 / [1, 2] | ✔ |
| `dp.initial` | 0 | ✔ |
| `dmg.pressure` (8) · `requery` (4) · `chainPursuit` (12) | — | ✘ **미사용** |
| `shield.durabilityDefault` (1) | — | ✘ 미사용 |
| `coercion.redStampFactor` (1.5) · `goblinReflectFactor` (2) · `finalConfirmReduce` (3) | — | ✘ 미사용 |
| `dp.rewardBattle` (20) | — | ✘ 미사용 |

<div class="callout warn">
<span class="tag">밸런서 주의</span>
✘ 표시 항목은 스키마 정의와 개발용 튜닝 콘솔 목록에만 존재하며 <b>게임 로직이 소비하지 않습니다</b>(일부는 <code>status: 'TBD'</code>). 이 수치를 조정해도 플레이는 바뀌지 않습니다.
</div>

#### 유물 3종 · 강화 4종 · 보상 19종

| 유물 | 효과 |
|---|---|
| 깨끗한 수첩 | 심문 시작 시 CP +1 |
| 봉인된 배지 | 판정마다 강압 −2 (조우당 1회) |
| 진실의 등불 | 최종 보스 전용 경로 개방 · F-13 연동 |

| 강화 | 효과 |
|---|---|
| 파란 인주 도장 | 강압 −1 (CONFIRM·CONTRADICT 호환) |
| 붉은 인주 도장 | 평정심 −2 추가 (모순 카드 2종 전용) |
| 시간 메모 포스트잇 | WHEN 면 진술 공개 (QUERY·CLARIFY 호환) |
| 확약 클립 | 진술을 COMMITTED로 고정 |

보상은 **BEST_RESOLUTION 또는 PARTIAL_RESOLUTION일 때만** 지급되며(실패·강제 자백에는 보상 화면 없음), 선택지는 일반 노드 3개 / 보스 노드 2개입니다. 희귀도는 Act와 보스·BEST 여부로 결정됩니다.

| Act | 보스 + BEST | 그 외 |
|---|---|---|
| 4 이상 | LEGENDARY | RARE |
| 1 ~ 3 | CASE | UNCOMMON |
| 0 (튜토리얼) | UNCOMMON | COMMON |

## 부록 C. 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| **504 (Outdated Optimize Dep)** | Vite 사전 번들 해시 폐기 | <kbd>Ctrl</kbd>+<kbd>F5</kbd> → 안 되면 `npx vite --force` |
| `pnpm: command not found` | corepack 미활성 | `corepack enable` |
| 설치 후 이상 동작 | npm으로 설치함 | `node_modules` 삭제 후 `pnpm install --frozen-lockfile` |
| 접속 주소가 5174 | 5173이 이미 점유됨 | 정상. dev server가 출력한 URL 사용 |
| **워크벤치에서 저장했는데 게임에 반영 안 됨** | 게임 탭이 이미 부팅된 레지스트리 유지 | **게임 탭 새로고침** |
| 저장 시 `E_PALETTE` | 불투명 색 16색 초과 | 팔레트 감축 후 재저장 |
| 저장 시 `E_FILENAME` | 파일명 밑줄 3토막 미만 | `카테고리_이름_상태.png` |
| 게임 부팅 시 `Duplicate asset slot` | 같은 키의 PNG가 둘 이상 | 루트/폴더 중복 파일 제거 |
| 새 PNG가 슬롯에 안 들어감 | 픽셀 크기 불일치 | **§4.2 슬롯 표**의 요구 PNG 크기 확인 |
| 조우 도중 새로고침했더니 처음부터 | 조우 중 상태는 저장 안 함 | 사양 |
| `mode=video`가 130초에 끝남 | 합격 구간은 135~165초 | **불합격**. 페이싱 재확인 |
| 오토플레이 URL이 무시됨 | 프로덕션 빌드 | DEV 서버(`pnpm dev`)에서만 동작 |
| 개발자 콘솔이 안 열림 | 프로덕션 빌드 / 키 오인 | DEV 빌드에서 <kbd>`</kbd> (백틱) |

## 부록 D. 표기·사실확인 노트

본 매뉴얼은 저장소 소스를 정본으로 삼았습니다. 기존 기획·프롬프트 문서와 다른 항목을 투명하게 밝힙니다.

| # | 항목 | 초안 문서 표기 | **구현 정본** |
|---|---|---|---|
| 1 | 개발 서버 포트 | `5174` 고정 | **5173** (설정 없음 = Vite 기본값). 저장소 grep에서 "5174" **0건** |
| 2 | 실행 명령 | `npm run dev` | **`pnpm dev`** (`pnpm-lock.yaml`만 존재, `check`는 pnpm 8회 호출) |
| 3 | 파트너 이름 | 김인턴 | **김 인턴** (공백 포함). 애셋 키는 `김_인턴` |
| 4 | 장르 문구 | Pixel-Art Deduction Interrogation RPG | 저장소 정본은 **데이터 기반 추리 카드 게임** / **이세계 대질 심문 로그라이크** |
| 5 | 조우 상태 수 | 19개 | **21개** = 진행 19 + 종료 2 (`ENCOUNTER_COMPLETE`, `FAILED`) |
| 6 | 비전투 이벤트 | 3종 | **6종** (패턴 A~F), 스트립이 각 1회씩 사용 |
| 7 | 심문 대상 | 용의자 9명 | **8명 용의자 + 참고인 1명(하피)** |
| 8 | 자원 라벨 | 평정심 | HUD 게이지는 **평정심**, 문자열 리소스는 **평정** (양쪽 병존) |
| 9 | 시연 합격 기준 | 150초 이내 | **150초 ± 15초** (135 ~ 165초). 너무 빨라도 불합격 |
| 10 | 타이틀 화면 | 존재 | `createTitleScreen`은 **미호출 데드 코드**. 첫 화면은 **런 스트립** |
| 11 | 런 스트립 분기 | 맵 선택 | **분기 없음**. 인덱스 +1 선형 전진 |
| 12 | AI 모델 | 특정 Claude 모델 | 소스에 모델 ID 없음. 식별자는 **`'claude-proxy'`**(캐시 키), 프록시 서버는 저장소 **미포함** |
| 13 | 워크벤치 푸터 문구 | "서버로 전송하지 않음" | 1클릭 직저장은 **개발 서버로 POST**합니다(푸터 문구가 기능 추가 전 설명) |
| 14 | `asset_manifest.json` | 게임이 읽음 | 게임은 **읽지 않음**. 런타임은 `import.meta.glob`으로 PNG 파일명에서 키 유도 |
| 15 | EP001·EP004 제목 | 빨간물 횡령 사건 / 차원 이동 엘리베이터 부실 공사 | **붉은 장부와 사라진 보급품** / **심야 용맥 급행의 우회권** |

#### 데이터 정합성 관찰 사항 (수정 권고)

| 위치 | 내용 |
|---|---|
| 튜토리얼 3개 조우 `state_conditions.composure_max` | 모두 30으로 적혀 있으나 실제 적용값은 **18 / 21 / 36**. EP001·EP004는 계산값과 일치하므로 튜토리얼 표기만 낡음 |
| 미노타우로스 목표 문구 | "강압 수치를 **40 이하로** 유지한다" — `KEEP_COERCION_BELOW`는 **엄격 미만(<)** 이므로 정확히 40이면 실패. 문구를 "40 미만"으로 수정 권고 |
| `event_tutorial_investigation` (패턴 C) | 콘텐츠에 저작되어 있으나 런 스트립 미배치 → 플레이 중 등장하지 않음 |
| 켄타우로스 포트레이트 | PNG·사이드카 존재하나 어떤 `case.json`에서도 미참조 |
| `ProofScope` 한국어 라벨 | 코드 상수(`시간`/`장소`/`행동`/`현장 존재`/`동선`/`증거 무결성`)와 `strings.ko.json`(`시각`/`위치`/`행위`/`출입`/`경로`/`무결성`)이 불일치 |

---

<div class="callout info">
<span class="tag">인쇄 안내</span>
브라우저에서 이 문서를 열고 <kbd>Ctrl</kbd>+<kbd>P</kbd> → <b>대상: PDF로 저장</b> → <b>용지 A4</b> → <b>여백 기본</b> → <b>배경 그래픽 켜기</b> 로 출력하십시오. 각 SECTION은 자동으로 새 페이지에서 시작하며, 표·코드 블록·콜아웃은 페이지 중간에서 잘리지 않습니다.
</div>

<p style="text-align:center; color:#7d7566; font-size:8.4pt; margin-top:8mm; border-top:2px solid #c9b98c; padding-top:3mm;">
던전 수사 조서 · 게임 소개·플레이 및 실행 매뉴얼 · 문서 버전 1.0 · 2026-08-08<br>
모든 수치·좌표·명령어는 <code>dungeon-dossier</code> 저장소 소스 대조 기준
</p>
