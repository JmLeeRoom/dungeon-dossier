<style>
/* ═══════════════════════════════════════════════════════════════════
   던전 수사 조서 · 팀 소개 및 역할 분담서 — 제출용 PDF 인쇄 스타일시트
   브라우저 인쇄(Ctrl+P) → "대상: PDF로 저장" → A4 → 배경 그래픽 켜기
   ═══════════════════════════════════════════════════════════════════ */

:root {
  --ink:        #0f0d0a;   /* Dark Ink  */
  --ink-soft:   #2b2620;
  --gold:       #d4af37;   /* Gold      */
  --gold-deep:  #8a6f1e;
  --cyan:       #00b4d8;   /* Cyan      */
  --cyan-deep:  #056f8a;
  --parchment:  #f4e8c1;   /* Parchment */
  --parchment2: #fbf5e2;
  --rule:       #c9b98c;
  --red:        #a94435;
  --green:      #4f7a46;
  --grey:       #7d7566;
}

@page { size: A4 portrait; margin: 17mm 15mm 15mm 15mm; }

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

h1 {
  font-size: 21pt; letter-spacing: -0.02em; color: var(--ink);
  border-bottom: 3px double var(--gold); padding-bottom: 4mm; margin: 0 0 5mm;
}
h2 {
  font-size: 14.5pt; color: var(--parchment);
  background: linear-gradient(90deg, var(--ink) 0%, var(--ink-soft) 78%, transparent 100%);
  border-left: 5px solid var(--gold);
  padding: 2.6mm 4mm; margin: 9mm 0 4mm;
  page-break-before: always; page-break-after: avoid;
}
h2:first-of-type { page-break-before: auto; }
h3 {
  font-size: 12pt; color: var(--gold-deep);
  border-bottom: 1.5px solid var(--rule);
  padding-bottom: 1.4mm; margin: 6.5mm 0 3mm; page-break-after: avoid;
}
h4 { font-size: 10.6pt; color: var(--cyan-deep); margin: 4.5mm 0 2mm; page-break-after: avoid; }

table {
  width: 100%; border-collapse: collapse; margin: 3mm 0 5mm;
  font-size: 8.9pt; page-break-inside: avoid;
}
thead th {
  background: var(--ink); color: var(--gold); font-weight: 600; text-align: left;
  padding: 2mm 2.4mm; border: 1px solid var(--ink);
}
tbody td { padding: 1.7mm 2.4mm; border: 1px solid var(--rule); vertical-align: top; }
tbody tr:nth-child(even) td { background: var(--parchment); }

blockquote {
  margin: 3.5mm 0; padding: 2.8mm 4mm; background: var(--parchment);
  border-left: 4px solid var(--cyan); color: var(--ink-soft); page-break-inside: avoid;
}
blockquote p { margin: 0.8mm 0; }

code {
  font-family: "D2Coding", "Cascadia Mono", "Consolas", monospace; font-size: 8.9pt;
  background: #efe4c2; color: #4a3a10; padding: 0.3mm 1.1mm;
  border-radius: 2px; border: 1px solid #dbc98f;
}
pre {
  background: var(--ink); color: var(--parchment); padding: 3.4mm 4mm;
  border-left: 4px solid var(--cyan); border-radius: 3px;
  font-size: 8.6pt; line-height: 1.55; page-break-inside: avoid; margin: 3mm 0 5mm;
}
pre code { background: none; border: none; color: inherit; padding: 0; font-size: inherit; }

/* ── 표지 ─────────────────────────────────────────────────────── */
.cover {
  border: 2px solid var(--gold); border-top-width: 8px;
  background: var(--ink); color: var(--parchment);
  padding: 8mm 8mm 6mm; margin-bottom: 7mm; page-break-inside: avoid;
}
.cover .eyebrow { color: var(--cyan); letter-spacing: .28em; font-size: 8.4pt; }
.cover h1 { color: var(--parchment); border: none; margin: 3mm 0 1mm; padding: 0; font-size: 26pt; }
.cover .sub { color: var(--gold); font-size: 11pt; margin: 0 0 4mm; }
.cover .meta { font-size: 8.6pt; color: #cbbf9c; border-top: 1px solid #4a4133; padding-top: 3mm; }
.cover .fill {
  display: inline-block; min-width: 46mm; border-bottom: 1px solid var(--gold);
  color: var(--gold); text-align: center;
}

/* ── 팀원 카드 ────────────────────────────────────────────────── */
.member {
  border: 1px solid var(--rule); border-left: 6px solid var(--gold);
  background: var(--parchment); padding: 4mm 5mm; margin: 4mm 0 2mm;
  page-break-inside: avoid;
}
.member .role {
  display: inline-block; background: var(--ink); color: var(--gold);
  font-size: 8pt; font-weight: 700; letter-spacing: .1em;
  padding: 0.6mm 2.4mm; border-radius: 2px;
}
.member .name { font-size: 15pt; font-weight: 700; margin: 2mm 0 0.5mm; color: var(--ink); }
.member .name small { font-size: 9pt; color: var(--grey); font-weight: 400; margin-left: 2mm; }
.member .line { font-size: 9pt; color: var(--ink-soft); margin: 1.5mm 0 0; }
.member.pending { border-left-color: var(--cyan); }
.member.pending .role { background: var(--cyan-deep); color: #fff; }

.callout {
  border: 1px solid var(--rule); border-left: 5px solid var(--gold);
  background: var(--parchment); padding: 3mm 4mm; margin: 3.5mm 0; page-break-inside: avoid;
}
.callout.warn { border-left-color: var(--red);  background: #fbe9e5; }
.callout.info { border-left-color: var(--cyan); background: #e6f6fb; }
.callout .tag {
  display: inline-block; font-size: 7.8pt; font-weight: 700; letter-spacing: .12em;
  background: var(--ink); color: var(--gold); padding: 0.5mm 2mm;
  border-radius: 2px; margin-bottom: 1.6mm;
}
.callout.warn .tag { background: var(--red);  color: #fff; }
.callout.info .tag { background: var(--cyan-deep); color: #fff; }

.chip {
  display: inline-block; font-size: 8pt; font-weight: 600;
  background: var(--cyan-deep); color: #fff;
  padding: 0.3mm 1.8mm; border-radius: 9px; margin-right: 1mm;
}
.chip.gold { background: var(--gold-deep); }
.chip.red  { background: var(--red); }
.chip.green{ background: var(--green); }

hr { border: none; border-top: 2px solid var(--rule); margin: 6mm 0; }

@media print {
  body { padding: 0; background: #fff; }
  a { color: var(--cyan-deep); text-decoration: none; }
}
</style>

<div class="cover">
  <div class="eyebrow">DUNGEON DOSSIER · TEAM INTRODUCTION &amp; ROLE DISTRIBUTION</div>
  <h1>던전 수사 조서</h1>
  <div class="sub">팀 소개 및 팀원별 역할·담당 영역 명세서</div>
  <div class="meta">
    출품작: 던전 수사 조서 (Dungeon Detective Kim Taehoon)<br>
    공모전: 2026 미니게임 메이커스 챌린지<br>
    팀명: <b style="color:#d4af37">태훈없는태훈팀</b> · 구성: 팀 참가 2인 (박건호 · 이재명)<br>
    개발 기간: 2026.07.26 ~ 2026.08.08 (14일)<br>
    문서 버전 1.1 · 2026-08-08 발행 · A4 인쇄 규격
  </div>
</div>

> **본 문서에 대하여** — 아래에 기재한 정량 지표는 모두 2026-08-08 저장소 스냅샷(`57ef39c`)에서 **직접 실행해 측정한 값**입니다. 추정치나 목표치는 포함하지 않았으며, 측정 명령과 원 출력은 **부록 A**에 그대로 실었습니다.

---

## SECTION 1. 프로젝트 & 팀 개요

### 1.1 프로젝트 개요

| 항목 | 내용 |
|---|---|
| **프로젝트명** | 던전 수사 조서 (Dungeon Detective Kim Taehoon) |
| **팀명** | **태훈없는태훈팀** |
| **팀 구성** | 2인 — 박건호 (기획·디자인) · 이재명 (엔진·UI·QA) |
| **슬로건** | "마왕군 몬스터들의 거짓 진술을 파훼하는 하드보일드 픽셀 추리 RPG" |
| **장르** | 데이터 기반 추리 카드 게임 · 이세계 대질 심문 로그라이크 |
| **플랫폼** | 데스크톱 웹 브라우저 (Chrome 최신) |
| **해상도** | 1280 × 800 HD (640 × 400 도트 좌표계 × 2배 정수 업스케일) |
| **기술 스택** | TypeScript 5.9 · Vite 8.2 · PixiJS 8.19 · Zod 4.4 · Howler 2.2 |
| **개발 기간** | 2026.07.26 ~ 2026.08.08 (14일) |
| **출품 공모전** | 2026 미니게임 메이커스 챌린지 |

### 1.2 팀 구성

<div class="member">
  <span class="role">LEAD CREATOR &amp; GAME DESIGNER</span>
  <div class="name">박건호 <small>Park Geonho</small></div>
  <div class="line"><b>담당</b> — 게임 기획 &amp; 디자인 · 세계관 &amp; 시나리오 · 밸런스 설계 · 문서 총괄</div>
  <div class="line"><b>핵심 산출</b> — 마왕 홀딩스 세계관과 캐릭터 12종, TruthGraph 모순 검증 규칙, 평정심/강압 밸런스, 5계층 아키텍처 설계, 15노드 진행 구조, 사건 3건 콘텐츠 저작</div>
</div>

<div class="member">
  <span class="role">CORE ENGINEER &amp; QA LEAD</span>
  <div class="name">이재명 <small>Lee Jaemyung</small></div>
  <div class="line"><b>담당</b> — 코어 엔진 &amp; UI/UX 개발 · 자동화 테스트 &amp; QA 하네스</div>
  <div class="line"><b>핵심 산출</b> — TypeScript/PixiJS 프레젠테이션 엔진, 5계층 카드 레이어링, 판정 Resolver, 에셋 워크벤치 1클릭 직저장 API, 959개 자동 검증 수트, 15노드 무인 완주 하네스</div>
</div>

<div class="callout info">
<span class="tag">역할 분담</span>
<b>기획·설계는 박건호</b>가, <b>구현·검증은 이재명</b>이 맡는 2인 분업 구조입니다. 기획자가 엔진 소스를 건드리지 않고 JSON 데이터만으로 사건을 확장할 수 있는 <b>Zero Engine Code Change</b> 아키텍처(§3.1 ②)가 이 분업을 코드 수준에서 보장합니다.
</div>

### 1.3 개발 기간 및 마일스톤

```text
   07/26 ─── 08/03 ─── 08/04 ─── 08/05 ─── 08/06 ─── 08/07 ─── 08/08
     │         │         │         │         │         │         │
     M1        M2        M3        M4        M5        M6        M7

   M1  기획 착수 · 심문 엔진 일반화 기획서 v2.0 저작
   M2  저장소 최초 커밋 · Phase 프롬프트 패키지 및 프로젝트 스캐폴드
   M3  플레이 가능 빌드 전환 · 전수 갭 분석 및 Phase 7 감사
   M4  1280×800 HD 전환 · 5계층 카드 레이어링
   M5  이벤트·컷씬·데드씬 · 에셋 워크벤치 1클릭 직저장
   M6  15노드 무인 완주 하네스 · mode=video 페이싱 확정
   M7  최종 무결성 게이트 · 제출 문서 세트 저작
```

---

## SECTION 2. 팀원별 역할 & 세부 담당 영역

### 2.1 박건호 — Lead Creator & Game Designer

| 구분 | 담당 영역 | 세부 수행 업무 & 기여 내용 |
|---|---|---|
| **게임 기획 & 디자인** | 게임 메커니즘 & 세계관 기획 | · 마왕 홀딩스 던전 취조실 세계관 및 **캐릭터 12종** 시나리오 기획<br>· TruthGraph 기반 진술–증거 모순 검증 규칙과 **평정심 / 강압 밸런스** 설계<br>· **5계층 아키텍처** 및 **15노드** 심문 수사 트리 레이아웃 기획<br>· 판정 축 6종과 조합 공간 432가지를 34행 판정표로 환원하는 규칙 설계 |
| **콘텐츠 저작** | 사건 · 진술 · 증거 데이터 | · 사건 3건(튜토리얼 · EP001 · EP004) 저작 — 진술 54개 · 증거 24개 · 입증 규칙 20개<br>· 심문 대상 9명(용의자 8 · 참고인 1)의 조우별 자원·목표·결과 조건 설정<br>· 카드 14종 · 유물 3종 · 강화 4종 · 보상 19종 · 플래그 13종 카탈로그 구성<br>· 등급 6단계와 엔딩 3종 판정 공식 설계 |
| **문서 & 제출물** | 기획서 · 프롬프트 패키지 총괄 | · 심문 엔진 일반화 기획서 v2.0 및 개발/기획 관점 구현계획서 저작<br>· Phase 0~7 단계별 마스터 프롬프트 패키지 20종 구성<br>· 공모전 제출 문서 세트(게임 매뉴얼 · AI 기술 명세서 · 팀 소개서) 총괄 |

### 2.2 이재명 — Core Engineer & QA Lead

| 구분 | 담당 영역 | 세부 수행 업무 & 기여 내용 |
|---|---|---|
| **게임 코드 개발** | 코어 엔진 & UI/UX 개발 | · TypeScript & PixiJS 기반 **1280 × 800 HD** 픽셀 아트 프레젠테이션 엔진 구축<br>· **5계층 카드 레이어링**(base→illust→stamp→post→evidence), 상단 **20 % → 40 % 호버 슬라이드** 및 640×725 원본 해상도 모달 focus 개발<br>· 태그–증거 **드래그 앤 드롭 점선 연결**(스티플 곡선) 구현<br>· 에셋 워크벤치 **1클릭 직저장 API**(`POST /api/workbench/save`) 및 3중 안전장치·6종 검증 구현<br>· 10단계 순수 함수 판정 Resolver와 34행 판정표 · 21개 상태 머신 구현 |
| **테스트 & 무결성** | 자동화 테스트 & QA 하네스 | · Vitest 기반 단위·통합·시뮬레이터 자동화 테스트 수트 **959개** 저작 (113개 파일)<br>· **15노드 무인 자동 완주** 하네스 및 **2분 30초 비디오 모드**(`mode=video`, 150초 ± 15초) 개발<br>· **Zod 스키마 검증** 및 DTO 경계 누설 차단 자동화 — 금지 키 22종 재귀 차단<br>· ESLint · dependency-cruiser 계층 검사 · 팔레트 16색 게이트를 CI 파이프라인으로 고정 |
| **아키텍처 강제** | 계층 경계 · 결정론 보장 | · 엔진의 PixiJS · DOM · `fetch` · 실시간 시각 · 비결정적 난수 사용을 정적 검사로 차단<br>· 모든 무작위성을 `run_seed` 파생 스트림으로 통일해 리플레이 재현성 확보<br>· 프로덕션 번들에서 개발자 콘솔·truth overlay가 물리적으로 제거되는지 빌드 플러그인으로 검사 |

<div class="callout">
<span class="tag">정정 사항</span>
작성 지시문에는 테스트 수트가 <b>"580+ 개"</b>로 기재되어 있었으나, 2026-08-08 스냅샷에서 <code>pnpm test</code>를 직접 실행한 결과는 <b>959개 전량 통과</b>였습니다. 실측값이 더 크므로 본 문서는 <b>959</b>로 기재합니다.
</div>

### 2.3 담당 영역 매트릭스

| 영역 | 세부 항목 | 박건호 | 이재명 |
|---|---|:---:|:---:|
| **기획** | 세계관 · 시나리오 · 캐릭터 12종 | ● 주도 | — |
| **기획** | 판정 규칙 · 밸런스 설계 | ● 주도 | ◐ 협업 |
| **기획** | 15노드 진행 구조 · 목표/등급/엔딩 | ● 주도 | — |
| **콘텐츠** | 사건 3건 · 진술 54 · 증거 24 · 입증 규칙 20 | ● 주도 | — |
| **개발** | 판정 엔진 (resolution · encounter · run) | ○ 지원 | ● 주도 |
| **개발** | 프레젠테이션 (PixiJS · 위젯 · 연출) | — | ● 주도 |
| **개발** | 콘텐츠 파이프라인 (Zod 스키마 · 로더) | ◐ 협업 | ● 주도 |
| **개발** | 에셋 워크벤치 · 1클릭 직저장 | ○ 지원 | ● 주도 |
| **개발** | AI 대사 파이프라인 · 폴백 체인 | — | ● 주도 |
| **QA** | 자동화 테스트 959개 · CI 게이트 | — | ● 주도 |
| **QA** | 무인 완주 하네스 · 비디오 모드 | — | ● 주도 |
| **문서** | 기획서 · Phase 프롬프트 · 제출 문서 세트 | ● 주도 | ○ 지원 |

<p style="font-size:8.6pt;color:#7d7566;margin-top:-2mm">
● 주도 &nbsp;·&nbsp; ◐ 협업 &nbsp;·&nbsp; ○ 지원 &nbsp;·&nbsp; — 미참여
</p>

---

## SECTION 3. 핵심 개발 성과 및 기여 요약

### 3.1 핵심 성과 3선

#### ① 기획–개발 분업 라이프사이클 완성

**박건호의 기획 문서가 곧 Zod 스키마가 되고, 이재명이 그 스키마를 검증 게이트로 구현**하는 구조를 세워, 2인 팀이 14일 만에 기획서 저작부터 프로덕션 빌드까지 전 과정을 완결했습니다. 기획 변경이 코드와 테스트에 자동 전파되므로 두 사람 사이의 인수인계 비용이 사실상 0에 수렴합니다.

#### ② Zero Engine Code Change 아키텍처 구축

기획자(박건호)가 엔진 소스를 건드리지 않고 `content/cases/*.json` 데이터만 추가해 신규 에피소드를 확장할 수 있는 **무코드 확장 체계**를 완비했습니다. 이 계약이 있어 기획과 구현이 서로를 기다리지 않고 동시에 진행됩니다.

> **검증된 사실** — 두 번째 사건(EP001)과 세 번째 사건(EP004)을 추가하는 동안 `src/engine/` 코드는 **단 한 줄도 수정되지 않았습니다.** 이 계약은 ESLint · dependency-cruiser · Vitest 아키텍처 검사가 CI에서 상시 강제하며, 엔진이 사건 ID 리터럴을 갖지 못하도록 하는 전용 테스트(`test_no_hardcoded_content_ids`)가 함께 감시합니다.

#### ③ 100 % 자동 검증 기반 품질 확보

**959개 테스트 전량 통과**, **프로덕션 빌드 오류 0건**을 달성했습니다. 판정 조합 공간 **432가지 전부**가 34행 판정표로 빠짐없이 해석되는지까지 테스트가 검증합니다.

### 3.2 정량 지표 (2026-08-08 실측)

| 지표 | 실측값 | 측정 방법 |
|---|---:|---|
| 자동화 테스트 | **959개 통과 / 959개** | `pnpm test` |
| 테스트 파일 | 113개 | `pnpm test` |
| 테스트 실패 | **0건** | `pnpm test` |
| 프로덕션 빌드 | **오류 0건** (2.56초) | `pnpm build` |
| 엔진·UI 소스 | 210개 파일 · 30,977줄 | `find src -name '*.ts'` |
| 테스트 코드 | 22,696줄 | `find tests -name '*.ts'` |
| 콘텐츠 JSON | 24개 | `find content -name '*.json'` |
| JSON Schema | 12종 | `find schemas -name '*.json'` |
| 런타임 애셋 PNG | 55개 | `find assets -name '*.png'` |
| 수록 사건 | 3건 (튜토리얼 · EP001 · EP004) | `content/cases/` |
| 진행 노드 | 15개 (조우 6 · 이벤트 6 · 보스 3) | `content/common/run-strip.json` |
| 심문 대상 | 9명 (용의자 8 · 참고인 1) | `content/cases/*/dialogue/` |
| 포트레이트 캐릭터 | 12종 | `assets/portraits/` |
| 카드 카탈로그 | 14종 · 의도 9종 | `content/common/cards.json` |
| 판정 코드 | 21종 · 판정표 34행 | `src/engine/resolution/` |
| 조우 상태 머신 | 21개 상태 (진행 19 + 종료 2) | `src/engine/encounter/` |

### 3.3 개발 프로세스 흐름도

```text
   기획 문서 저작                                기획서 · Phase 프롬프트 패키지
        │
        │   진술 · 증거 · 입증 규칙을 데이터로 환원
        ↓
   Zod 스키마 정의                              단일 원본 · JSON Schema 12종 자동 생성
        │
        ├──→ content/cases/*.json               사건 데이터 (엔진 수정 0건)
        │
        ↓
   순수 함수 판정 엔진                          10단계 Resolver · 34행 판정표
        │
        │   PublicDTO 조립 · truth 계열 22개 키 차단
        ↓
   PixiJS 프레젠테이션                          640×400 → 1280×800 정수 업스케일
        │
        ├──→ 에셋 워크벤치                       PNG 드롭 · 좌표 확정 · 1클릭 직저장
        │
        ↓
   자동 검증 게이트                             lint · arch · typecheck · test 959
        │
        ↓
   무인 완주 하네스                             15노드 · mode=video 150초 ± 15초
        │
        ↓
   프로덕션 빌드                                오류 0건 · dev 콘솔 물리적 제거 검사
```

### 3.4 기여도 요약

| 구분 | 박건호 | 이재명 |
|---|---:|---:|
| 기획 · 시나리오 · 세계관 | **100 %** | — |
| 콘텐츠 데이터 저작 | **100 %** | — |
| 밸런스 설계 | **70 %** | 30 % |
| 엔진 · 게임 로직 | 20 % | **80 %** |
| UI · 연출 | — | **100 %** |
| 테스트 · QA · CI | — | **100 %** |
| 문서 · 제출물 | **80 %** | 20 % |
| **종합** | **약 50 %** | **약 50 %** |

```text
   기획 · 콘텐츠 · 문서    ████████████████████████████░░░░░░░░░░░░░░░░  박건호
   엔진 · UI · QA         ░░░░░░░░░░░░░░░░░░░░░░░░████████████████████  이재명
```

<div class="callout info">
<span class="tag">산정 기준</span>
위 기여도는 <b>팀 자체 신고 기준</b>입니다. 저장소의 커밋 11개가 단일 계정(<code>Developer</code>)으로 기록되어 있어 커밋 이력만으로는 인별 분리가 되지 않으므로, 담당 영역 선언을 근거로 배분했습니다. 반면 <b>§3.2의 정량 지표는 전부 실행 측정값</b>이며 신고에 의존하지 않습니다.
</div>

---

## 부록 A. 정량 지표 측정 근거

본 문서의 모든 수치는 2026-08-08 저장소 스냅샷(`57ef39c`)에서 아래 명령을 직접 실행해 얻었습니다.

```bash
cd dungeon-dossier
corepack pnpm test      # 자동화 테스트 전량 실행
corepack pnpm build     # 프로덕션 빌드
```

#### 테스트 실행 결과

```text
 RUN  v4.1.10 D:/NHNhackerton/dungeon-dossier

 Test Files  113 passed (113)
      Tests  959 passed (959)
   Start at  18:58:17
   Duration  12.22s
```

#### 프로덕션 빌드 결과

```text
 dist/_app/game-D35yjvz2.js   530.15 kB │ gzip: 157.40 kB
 ✓ built in 2.56s
```

> 빌드 경고 1건은 청크 크기 권고(500 kB 초과)이며 **오류가 아닙니다.** PixiJS 런타임이 단일 청크로 묶인 결과로, 게임 실행에 영향이 없습니다.

#### 기간 산정 근거

| 기준 | 날짜 | 근거 |
|---|---|---|
| 기획 착수 | 2026.07.26 | 기획서 파일명 `..._v2.0_260726_1.md` |
| 저장소 최초 커밋 | 2026.08.03 | `git log --reverse` |
| 최종 커밋 | 2026.08.08 | `git log -1` |
| 총 커밋 | 11개 | `git log --oneline` |

---

## 부록 B. 기재 확정 확인

본 문서의 모든 항목이 확정 기재되었습니다. 미기입·추정 항목은 없습니다.

| # | 항목 | 위치 | 상태 |
|---|---|---|---|
| 1 | 팀명 | 표지 · §1.1 | ✔ 확정 — 태훈없는태훈팀 |
| 2 | 팀 구성 · 인원 | 표지 · §1.1 · §1.2 | ✔ 확정 — 2인 (박건호 · 이재명) |
| 3 | 팀원별 담당 영역 | §2.1 · §2.2 | ✔ 확정 |
| 4 | 담당 영역 매트릭스 | §2.3 | ✔ 확정 |
| 5 | 기여도 배분 | §3.4 | ✔ 확정 (팀 신고 기준, 산정 근거 명시) |
| 6 | 정량 지표 | §3.2 · 부록 A | ✔ 확정 (실행 측정값) |

<div class="callout info">
<span class="tag">인쇄 안내</span>
브라우저에서 이 문서를 열고 <kbd>Ctrl</kbd>+<kbd>P</kbd> → <b>대상: PDF로 저장</b> → <b>용지 A4</b> → <b>배경 그래픽 켜기</b> 로 출력하십시오. 각 SECTION은 자동으로 새 페이지에서 시작합니다.
</div>

<p style="text-align:center; color:#7d7566; font-size:8.4pt; margin-top:8mm; border-top:2px solid #c9b98c; padding-top:3mm;">
던전 수사 조서 · 태훈없는태훈팀 (박건호 · 이재명) · 팀 소개 및 역할·담당 영역 명세서<br>
문서 버전 1.1 · 2026-08-08 · 2026 미니게임 메이커스 챌린지 제출용 · 모든 정량 지표는 저장소 실측 기준
</p>
