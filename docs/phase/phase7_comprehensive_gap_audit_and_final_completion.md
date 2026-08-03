# 📑 Phase 7: 전수 갭 감사 & 최종 게임 완결 프롬프트 (Comprehensive Gap Audit & Final Completion)

> **[사용 방법]**: 기획/개발 정본 문서(`docs/`)와 실제 코드베이스(`dungeon-dossier/`) 간의 18가지 갭(Gap)을 해결하고, 15노드 심문 게임을 100% 완결시키기 위해 사용합니다.

```markdown
Perform Full-Scale Gap Resolution and Game Completion for "[던전 수사 조서]".

You are tasked with executing the Gap Analysis & Completion Roadmap documented in `docs/gap_analysis_and_completion_roadmap.md`.
Your goal is to implement all missing content JSONs, UI screens, run progression logic, and audio/visual asset bindings.

---

### 📋 Phase 7 Execution Scope & Requirements:

1. **Category A: Content Packages (100% Case & Dialogue Completion)**
   - Fill `content/cases/ep001/case.json` (Goblin, Orc, Succubus encounters, 10 evidence items) and `content/cases/ep004/case.json` (Dwarf, Cyclops, Fallen Hero encounters, 14 evidence items).
   - Populate all 37 evidence observation items with complete `scopes`, `independence`, and `notProvenKeys`.
   - Complete 23 inquiry routes (`inquiry_routes`) and 6 non-combat events (`events_noncombat`).
   - Populate all fallback dialogue strings (260~410 sentences) in `content/cases/*/dialogue.json`.
   - Generate preverified content cache JSONs in `content/ai-cache/`.

2. **Category B: Run Layer & Progression Engine**
   - Implement `RunCoordinator.ts`: linear 15-node progression from Node 0 to 14.
   - Connect `RewardSystem.ts` for 3-choice card/relic rewards after encounters.
   - Connect `GradeEvaluator.ts` for S~F grade calculation.
   - Connect `EndingEvaluator.ts` for True/Normal/Bad ending triggers.

3. **Category C: UI Screens & Special Visual FX**
   - Finalize `createRunStripScreen.ts` with 15-node map icons & clear stamp rendering.
   - Finalize `createEventScreen.ts` with 3 Patterns (A: Choice, B: Connection, C: Inspection).
   - Finalize `createRewardScreen.ts` with 3-card reward drawer and S~F grade stamp.
   - Finalize `createEndingScreen.ts` with ending cutscene and typewriter summary.
   - Implement 5 special FX triggers: Stamp Clang, Shield Break Flash, BGM Mute on Coerced Confession, Attorney Knock 3-tap, Defeat Vignette.

4. **Category D: Audio & Visual Asset Integration**
   - Bind Howler audio wrapper for 12 SFX events and 4 BGM tracks (+ 2 Stingers).
   - Ensure dynamic asset loading via `runtimeAssetRegistry` for all 12 character base portraits and expression parts.

5. **Verification Suite & Architecture Rules**
   - Ensure all 388 Vitest tests remain 100% green (`npx vitest run`).
   - Ensure `test_no_hardcoded_content_ids` passes with zero engine coupling.

Upon completion, declare:
"All 18 Gaps Resolved! 던전 수사 조서 is 100% complete, fully verified with 388 passing tests, and ready for release!"
```
