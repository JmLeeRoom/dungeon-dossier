# 📑 던전 수사 조서: 팀 소개 및 팀원별 역할·담당 영역 제출용 PDF 문서 작성 프롬프트

> **[사용 방법]**: 본 마스터 프롬프트를 AI 에이전트에 전달하여 **[던전 수사 조서 (Dungeon Detective Kim Taehoon)]** 프로젝트의 팀 구성, 팀원별 핵심 역할, 세부 담당 영역 및 기여도를 정리한 **최종 제출용 PDF 인쇄 규격 마크다운 문서(`docs/manual/team_introduction_and_roles.md`)**를 자동 저작하도록 지시합니다.

```markdown
Role: Team Leader, Project Manager & Presentation Lead
Task: Generate a Publication-Ready Team Introduction and Role Distribution Document in PDF Printable Markdown for "[던전 수사 조서 (Dungeon Detective Kim Taehoon)]".

---

## 1. 🎯 목표 및 제출 규격 (Document Objectives)

본 문서의 목적은 해커톤/공모전 평가위원회 및 심사위원단에 **[던전 수사 조서]** 프로젝트 개발 참여 팀원의 인적 사항, 핵심 역할, 담당 개발 영역 및 기여도를 명확히 증명하는 **최종 제출용 PDF 인쇄 마크다운 문서(`docs/manual/team_introduction_and_roles.md`)**를 작성하는 것입니다.

### 📐 PDF 인쇄 스타일 가이드 (Print Layout Rules)
- A4 규격 레이아웃 및 픽셀 아트 테마 CSS 스타일 적용.
- 다크 잉크(#0f0d0a), 골드(#d4af37), 청록(#00b4d8), 파치먼트(#f4e8c1) 컬러 톤앤매너.
- 팀원 정보 카드, 담당 영역 세부 표, 개발 프로세스 흐름도 및 기여도 요약 포함.

---

## 2. 📑 본문 구성 및 팀원 역할 명세 (Required Structure)

### 📌 SECTION 1. 프로젝트 & 팀 개요 (Project & Team Overview)
1. **프로젝트명**: [던전 수사 조서 (Dungeon Detective Kim Taehoon)]
2. **개발 기간**: 2026.07.26 ~ 2026.08.08
3. **팀명 및 구성**: [팀명 / 1인 또는 다인 전담 팀]
4. **프로젝트 슬로건**: "마왕군 몬스터들의 거짓 진술을 파훼하는 하드보일드 픽셀 추리 RPG"

---

### 📌 SECTION 2. 팀원별 역할 & 세부 담당 영역 (Team Member Roles & Tasks)

#### 👤 팀원 1: 박건호 (Lead Creator & Developer)

| 구분 | 담당 영역 | 세부 수행 업무 & 기여 내용 |
|---|---|---|
| **게임 기획 & 디자인** | **게임 메커니즘 & 세계관 기획** | - 마왕 홀딩스 던전 취조실 세계관 및 캐릭터 12종 시나리오 기획<br>- TruthGraph 기반 진술-증거 모순 검증 규칙 및 평정심/강압도 밸런스 설계<br>- 5계층 아키텍처 및 15노드 심문 수사 트리 레이아웃 기획 |
| **게임 코드 개발** | **코어 엔진 & UI/UX 개발** | - TypeScript & PixiJS 기반 1280×800 HD 픽셀 아트 프레젠테이션 엔진 구축<br>- 5계층 카드 레이어링, 상단 20%→40% 호버 슬라이드 & 모달 focus 개발<br>- 태그-증거 드래그 앤 드롭 점선 연결 및 에셋 워크벤치 1클릭 직저장 API 개발 |
| **테스트 & 무결성** | **자동화 테스트 & QA 하네스** | - Vitest 기반 단원/통합/시뮬레이터 자동화 테스트 수트(580+ 개) 저작<br>- 15노드 무인 자동 완주 테스트 하네스 및 2분 30초 비디오 모드(`mode=video`) 개발<br>- Zod 스키마 검증 및 DTO 경계 롤백 자동화 시스템 구축 |

---

### 📌 SECTION 3. 핵심 개발 성과 및 기여 요약 (Key Accomplishments)

1. **기획-개발 통합 원맨/핵심 주도 라이프사이클 완성**:
   - 게임 기획서 저작부터 Zod 스키마 설계, PixiJS UI 위젯 렌더러 구현, 자동 플레이 하네스 및 CI/CD 품질 게이트 구축까지 전 과정 주도.
2. **Zero Engine Code Change 아키텍처 구축**:
   - 기획자가 엔진 소스 변경 없이 `content/cases/*.json` 데이터 추가만으로 신규 에피소드를 확장할 수 있는 무코드 확장 체계 완비.
3. **100% 자동 검증 기반 품질 확보**:
   - 580개 이상의 테스트 케이스 100% Green 통과 및 프로덕션 빌드 0 Error 달성.

---

## 3. 🧪 저작 프로토콜 (Execution Protocol)

AI 에이전트는 위 내용을 바탕으로 `docs/manual/team_introduction_and_roles.md` 문서를 작성하고, HTML/CSS PDF 인쇄 스타일을 포함하여 브라우저에서 바로 PDF 출력이 가능하도록 완벽히 구성하세요.

Acknowledge these team introduction specification requirements and reply: "Team Introduction PDF Specification Protocol Activated."
```
