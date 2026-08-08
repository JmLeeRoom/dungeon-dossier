# 🏗️ 던전 수사 조서 — 에셋 워크벤치 PM 1클릭 `assets/` 직저장 구현 설계서

| 항목 | 내용 |
|---|---|
| 문서 ID | `docs/design/workbench_disk_save_feature_design.md` |
| 버전 | v1.0 (2026-08-07) |
| 대상 코드베이스 | `dungeon-dossier/` — **본 문서의 모든 파일:라인·시그니처는 2026-08-07 작성 시점 실측** |
| 선행 규격 | `docs/phase/prompt_workbench_disk_save_feature.md` (마스터 프롬프트) |
| 검증 게이트 | `corepack pnpm typecheck` · `test` · `content:validate` · `build` (+ 본 기능 특성상 `palette:check` 필수, §0.3) |

---

## 0. 실측 기준선 — "이미 있는 것"과 "만들 것"의 경계

> **⚠️ 이 절이 본 설계서의 핵심이다.** 마스터 프롬프트 §2-1️⃣은 PNG를 `assets/` **루트에 평면(flat) 기록**하도록 지시하지만,
> 실측 결과 **그대로 구현하면 게임이 부팅 단계에서 예외로 죽는다**(§0.2). 아래 실측 위에 설계를 세운다.

### 0.1 이미 존재하는 자산

| 영역 | 실측 사실 | 근거 |
|---|---|---|
| Vite 플러그인 | `copyRuntimeData()`(build 전용, `content`/`assets`/`schemas`를 dist로 복사) · `assertDeveloperConsoleTreeShaken()`(build 전용) **2개뿐.** **개발 서버 미들웨어(`configureServer`)는 저장소 전체에 하나도 없다** → `/api/**` 엔드포인트는 완전 신규 | `vite.config.ts:18-43, 50-71, 77` |
| 개발 서버 설정 | `server: { host: true, fs: { strict: true } }` — `fs.strict`는 **읽기** 경계만 제한하며 미들웨어의 쓰기와는 무관 | `vite.config.ts:78-83` |
| 빌드 엔트리 | `game`(`index.html`) + `assetWorkbench`(`workbench/index.html`) 2-엔트리. 워크벤치는 게임 번들과 분리 | `vite.config.ts:90-95` |
| 매니페스트 스키마 | `AssetManifestSchema` = `{ schema_version:'3.0', stage{width,height,render_width,render_height,render_scale}, slots: Record<string, AssetManifestSlot> }`, `AssetTransform`에 `customWidth/customHeight/preserveAspectRatio` 포함. **직렬화기 이미 존재** | `src/ui/core/assetManifest.ts:63-74, 240-242` |
| 워크벤치 매니페스트 | `buildAssetManifest(state)` / `serializeAssetManifest(state)` — 16슬롯 전체를 문서로 조립하는 함수 **이미 존재**(신규 조립 코드 불필요) | `workbench/model.mts:1175, 1194-1195` |
| 매니페스트 파일명 | `ASSET_MANIFEST_JSON_NAME = 'asset_manifest.json'` **이미 상수화** | `workbench/model.mts:24` |
| 이미지 상태 | `SlotImageState { dataUrl, originalName }`, `isPngDataUrl()`가 `/^data:image\/png;base64,/iu` 강제. **Base64 Data URL이 이미 상태의 저장 형식** → 신규 수집 로직 불필요 | `workbench/model.mts` `isPngDataUrl` |
| 파일명 해석 | `stageSlotDownloadName(id)` — 캐릭터 바인딩 슬롯이면 `characterPartFileName(character, part)`, 아니면 `canonicalDownloadName(id)`. **다운로드가 이미 이 함수로 통일돼 있다** | `workbench/main.mts:331-336, 338-344` |
| 다운로드 경로 | `triggerDownload()`(a[download]) · `downloadTextFile()`(Blob) · 버튼 `#download-asset-manifest`가 `downloadTextFile(serializeAssetManifest(state), ASSET_MANIFEST_JSON_NAME)` 호출 | `workbench/main.mts:321-329, 346-352, 945-947` |
| 상태창 | `setStatus(message, isError = false)` → `#save-status`(`<output aria-live="polite">`)에 값·텍스트 기록 + `data-error` 토글. **PM 알림 채널 이미 존재** | `workbench/main.mts:273-277`, `workbench/index.html` `#save-status` |
| PNG 검증 | `parsePngHeaderDimensions(bytes)`(IHDR 직독) · `validateSlotImageDimensions(slotId, actual)` · `validatePngDescriptor(file)` **이미 존재, 한국어 오류 메시지 포함** | `workbench/model.mts:722, 742` |
| 안전 경로 유틸 | `resolveOutputSubdirectory(outputDirectory, relativeDirectory)` — `path.resolve` 후 `relative.startsWith('..')` 검사로 루트 탈출 차단. **동일 문제를 이미 해결한 선례** | `tools/placeholder/index.mjs:514-521` |
| 카테고리→폴더 매핑 | `배경→bg` `전경→fg` `portrait→portraits` `card→cards` `ev→evidence` `아이콘→ui` `placeholder→ui` `dead→dead` — **데이터로 이미 존재** | `tools/placeholder/placeholders.json` |
| 테스트 관용구 | `mkdtemp(path.join(tmpdir(), 'dossier-…-'))` in `beforeAll` → `rm(dir, {recursive:true, force:true})` in `afterAll`, 툴은 `promisify(execFile)`로 기동 | `tests/ui/portrait-placeholder-catalog.test.ts:1-9, 22, 120-137` |
| TS 툴 테스트 선례 | **`.mjs` CLI는 자식 프로세스로, TS 툴 모듈은 직접 import**해서 테스트한다 — `tests/schema/schema-export.test.ts`가 `tools/schema-export`를 곧바로 import(프로젝트가 달라도 동작). `tests/content-io/tool-validation.test.ts`는 `tools/validate`의 로직 TS 모듈만 import하고 CLI는 건드리지 않는다 → **"로직은 import 가능한 TS 모듈, 껍데기는 얇게"가 이 레포의 선호 패턴** | `tests/schema/schema-export.test.ts`, `tests/content-io/tool-validation.test.ts` |
| vitest 환경 | `environment: "node"`(jsdom 미설치, 전 파일 공통), `include: ["tests/**/*.test.ts", "src/**/*.test.ts"]`, `clearMocks`/`restoreMocks` true, `sequence.concurrent: false` | `vite.config.ts:97-105` |
| `/api/` 접두사 선례 | `createPhase4DialogueService`가 `proxyEndpoint ?? '/api/dialogue'`를 호출하지만 **서버 핸들러는 없다**(프록시 전제). `/api/workbench/save`는 이 접두사 관례와 충돌하지 않는다 | `src/app/createPhase4DialogueService.ts:89` |
| 미들웨어 선례 | 없음. `node:http`/`node:stream`/`node:net` 사용처가 `tests/`·`src/`·`tools/` 통틀어 **0건** → req/res 목 헬퍼를 이 기능이 처음 도입하게 된다 | 레포 전역 grep |

### 0.2 🔴 치명적 실측 — 평면 기록은 게임을 죽인다

런타임 에셋 레지스트리는 **디렉터리를 무시하고 파일명만으로 키를 만들며, 키가 겹치면 예외를 던진다.**

```ts
// src/ui/core/runtimeAssetRegistry.ts:4-8
const discoveredPngUrls = import.meta.glob<string>('../../../assets/**/*.png', { eager: true, … });

// src/ui/core/assetRegistry.ts:29-38
for (const path of Object.keys(entries).sort()) {
  const slot = parseAssetFilename(path, entries[path] as string);
  const key = `${slot.category}/${slot.name}/${slot.state}`;
  if (registry.has(key)) throw new Error(`Duplicate asset slot: ${key}`);   // ← 여기
  registry.set(key, slot);
}
```

* Vite의 `**/`는 **0개 디렉터리도 매칭**하므로 `assets/배경_심문실_시안.png`(루트)와 `assets/bg/배경_심문실_시안.png`(현재 위치)가 **둘 다 글롭에 잡힌다.**
* 두 경로의 키는 똑같이 `배경/심문실/시안` → `Duplicate asset slot` 예외 → `runtimeAssetRegistry`는 모듈 최상위에서 평가되므로 **게임 첫 화면조차 뜨지 않는다.**
* 현재 `assets/` 루트에는 PNG가 0개이고 모든 PNG는 8개 하위 폴더(`bg` 3 · `cards` 4 · `dead` 4 · `evidence` 3 · `fg` 1 · `portraits` 49 · `ui` 3 · `fonts`)에 있다 — 즉 **지금 정확히 안전한 상태이며, 평면 기록이 그것을 깬다.**

> **⇒ 설계 결론**: 저장 대상 경로는 `assets/<카테고리 폴더>/<파일명>.png`로 **라우팅**해야 하며,
> 서버는 `assets/` 루트 직하 PNG 기록을 **명시적으로 거부**한다(§2.4 `E_FLAT_WRITE`).

### 0.3 🟠 두 번째 실측 — 저장 즉시 레포 게이트가 깨질 수 있다

`pnpm palette:check`는 `assets/**` 전체 PNG를 재귀 검사하며 **불투명 RGBA 색상 16개**를 넘으면 실패한다.

```js
// tools/palette-check/index.mjs:10
export const MAX_OPAQUE_RGBA_COLOURS = 16;
```

PM이 일반 그래픽 툴에서 뽑은 풀컬러 PNG를 1클릭 저장하면 **`palette:check`가 즉시 레드**가 된다(안티에일리어싱 한 번이면 수백 색). "1클릭 저장"이 "1클릭 CI 파손"이 되지 않도록, 저장 **직전에 서버가 팔레트를 검사**하고 거부한다(§2.4 `E_PALETTE`). 검사기는 이미 `checkPalettes()`로 모듈화돼 있어 재사용한다.

### 0.4 🟡 세 번째 실측 — `asset_manifest.json`은 런타임 입력이 아니다

```ts
// src/ui/core/runtimeAssetRegistry.ts:10-13
/**
 * Vite discovers files; the runtime registry derives every slot from the
 * filename. There is intentionally no hand-maintained asset manifest.
 */
```

* `asset_manifest.json`은 **저장소 어디에도 실재하지 않으며**(`find` 결과 0건), 게임 코드가 읽지도 않는다.
* 따라서 이 파일은 **기획 산출물(placement 기록)**이지 런타임 데이터가 아니다. 저장은 하되, **"이걸 저장하면 게임에 반영된다"는 오해를 주는 문구를 UI에 쓰지 않는다**(§3.3).
* 게임에 실제로 반영되는 것은 **PNG 파일 그 자체**뿐이다.

### 0.5 🟡 네 번째 실측 — 저장 성공 = 게임 탭 강제 새로고침

`src/` · `workbench/` 어디에도 `import.meta.hot` 이 **0건**이다. 따라서 새 PNG가 글롭을 무효화하면 수용자(acceptor)를 만나지 못하고 **전체 페이지 리로드**로 승격된다.

* 게임 탭이 열려 있으면 **진행 중이던 심문 런 상태가 통째로 날아간다.**
* `runtimeAssetRegistry`는 모듈 최상위 `const`이고 `preloadRuntimeAssets()`는 부팅 때 한 번만 돈다(`bootstrap.ts` 초입) → 리로드 없이는 어차피 새 PNG가 반영되지 않는다.
* ⇒ 설계상 이것을 고치려 하지 않는다(HMR 수용자 도입은 본 기능의 범위 밖). 대신 **성공 안내에 "게임 탭은 새로고침해야 반영됩니다"를 명시**한다(§3.3).

### 0.6 아키텍처 불변 조건

1. 플러그인은 반드시 **`apply: 'serve'`** — 프로덕션 번들·`dist/`에 서버 코드가 새어들면 안 되고, 기존 두 플러그인도 전부 `apply: 'build'`로 단계를 명시하는 관례를 따른다(`vite.config.ts:21, 52`).
2. **서버 모듈 확장자는 `.ts`여야 한다.** `tsconfig.node.json`의 `include`가 `["vite.config.ts", "tools/**/*.ts"]`로 **`.mts`를 포함하지 않기** 때문에, `tools/workbench-save/handler.mts`로 두면 `pnpm typecheck` 어느 프로젝트에도 잡히지 않는 **타입 사각지대**가 된다. (워크벤치가 `.mts`인 것은 `tsconfig.json`이 `workbench/**/*.mts`를 명시 포함하기 때문이며, `tools/`에는 그 예외가 없다.)
3. 워크벤치 클라이언트는 `src/ui/core/**`만 import하는 기존 의존 방향을 유지한다(`workbench/model.mts:1-12`).
4. 신규 사용자 노출 문자열은 워크벤치 관례대로 **한국어 리터럴**(워크벤치는 `strings.ko.json` i18n 대상이 아님).
5. 파괴적 쓰기이므로 **덮어쓰기 대상 파일 목록을 응답에 반드시 포함**해 PM이 무엇이 바뀌었는지 사후 확인할 수 있어야 한다.
6. **Windows 우선 레포**(`engines.node >=22.13 <23`, 개발기 win32). 경로 비교·응답 문자열은 `path.sep`을 `/`로 정규화한다 — 기존 도구도 그렇게 한다(`tools/validate/index.mjs:83` `replaceAll("\\", "/")`).
7. `noUncheckedIndexedAccess` · `exactOptionalPropertyTypes`가 켜져 있어 `req.url` 같은 값은 **명시적 `undefined` 가드**가 필수다(`!`·`as` 금지).

---

## 1. Section 1 — Architectural Flowchart

### 1.1 전체 흐름

```
┌─ 브라우저 (workbench/index.html + main.mts) ─────────────────────────┐
│                                                                      │
│  PM: PNG 드래그&드롭 → 슬롯 배치/회전/스케일 편집                      │
│                          ↓                                           │
│  [ 💾 프로젝트 assets/ 에 직접 저장 ] 클릭                             │
│                          ↓                                           │
│  collectWorkbenchSaveRequest(state)          ← workbench/model.mts   │
│    ├ buildAssetManifest(state)               (16슬롯 배치 문서)        │
│    └ 슬롯·캐릭터파츠 순회 → WorkbenchSaveFile[]                        │
│         { path: 'bg/배경_심문실_시안.png', dataUrl: 'data:image/png…' }│
│                          ↓                                           │
│  fetch('/api/workbench/save', {method:'POST', body: JSON})            │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ HTTP POST (dev server only)
┌──────────────────────────▼───────────────────────────────────────────┐
│ Vite dev server — saveWorkbenchAssetsPlugin()   apply: 'serve'        │
│                                                                      │
│  server.middlewares.use('/api/workbench/save', handler)               │
│                          ↓                                           │
│  ① readJsonBody(req, MAX_BODY_BYTES)          → 413 초과 시 거부       │
│  ② WorkbenchSaveRequestSchema.safeParse()     → 400 (E_SCHEMA)       │
│  ③ 파일별 검증 파이프라인 (전부 통과해야 1건도 쓰지 않음)                 │
│     ├ resolveAssetTarget(path)   경로 화이트리스트·탈출 차단           │
│     │                            (E_PATH / E_FLAT_WRITE / E_DIR)     │
│     ├ decodePngDataUrl(dataUrl)  Base64 → Buffer  (E_DATA_URL)       │
│     ├ parsePngHeaderDimensions() PNG 시그니처·IHDR (E_NOT_PNG)        │
│     └ countVisibleRgbaColours()  ≤16색          (E_PALETTE)          │
│                          ↓                                           │
│  ④ mkdir(recursive) → writeFile(tmp) → rename(final)  ★원자적 교체     │
│     + asset_manifest.json (JSON.stringify(manifest, null, 2))        │
│                          ↓                                           │
│  ⑤ 200 { ok:true, savedFiles[], skippedFiles[], assetsRoot, message } │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────────┐
│ 디스크: dungeon-dossier/assets/                                       │
│   ├ asset_manifest.json          (기획 산출물 · 런타임 미사용 §0.4)     │
│   ├ bg/배경_심문실_시안.png        ← 덮어쓰기                           │
│   ├ cards/card_기본_템플릿.png                                        │
│   ├ portraits/portrait_하피_base.png                                  │
│   └ …                                                                │
│                          ↓                                           │
│ Vite file watcher → import.meta.glob 무효화 → **전체 페이지 리로드**    │
│   (import.meta.hot 수용자가 0건이므로 HMR이 아니라 full reload · §0.5) │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 검증-후-기록(validate-then-write) 원칙

**부분 저장을 만들지 않는다.** ③의 검증은 전체 파일에 대해 먼저 수행하고, 한 건이라도 실패하면 **아무것도 쓰지 않고** 400을 반환한다.

이유: PM이 "저장 실패"를 봤는데 절반이 이미 덮어써져 있으면 `assets/`가 중간 상태로 남고, git diff로만 복구 가능해진다. 원자성은 파일 단위로는 `rename`으로, 요청 단위로는 "선검증"으로 확보한다.

### 1.3 모듈 배치

| 계층 | 신규 모듈 | 이유 |
|---|---|---|
| 서버 | `tools/workbench-save/handler.ts` | `vite.config.ts`에 로직을 인라인하면 **테스트가 불가능**하다(§4.1). 핸들러를 순수 모듈로 분리하고 `vite.config.ts`는 얇게 위임만 한다. **`.ts` 필수**(§0.6-2) |
| 서버 | `tools/workbench-save/index.ts` (`saveWorkbenchAssetsPlugin()`) | `Plugin` 객체 생성 + connect 어댑터만 담당 |
| 클라이언트 | `workbench/model.mts` 증축 | 경로 라우팅(`assetTargetPath`)은 **파일명 규칙을 이미 소유한** 모델이 맡는다 |
| 클라이언트 | `workbench/main.mts` 증축 | 버튼 핸들러 + `fetch` + `setStatus` |

> `src/dev/**`가 아니라 `tools/**`에 두는 이유: `src/dev/**`는 프로덕션 번들 트리셰이킹 게이트(`vite.config.ts:50-71`)와 소스 텍스트 게이트(`tests/arch/dev-console-gating.test.ts`) 양쪽의 감시 대상이며 **브라우저 코드**를 전제한다. 본 핸들러는 Node 전용이므로 기존 Node 도구(`tools/validate`, `tools/placeholder`, `tools/palette-check`, `tools/schema-export`)와 같은 자리에 둔다.
>
> **스키마 공유 주의**: `tools/**`(tsconfig.node)는 `types: ["node"]`만 갖고 `src/**`(tsconfig)는 `vite/client`를 갖는다. 핸들러가 `src/ui/core/assetManifest.ts`를 import하는 것은 **가능하지만**(순수 zod·수학뿐, DOM/`import.meta.env` 미사용) 이 경계는 얇게 유지하고 그 외 `src/**` import는 금지한다.

---

## 2. Section 2 — Payload Schema & API Contract

### 2.1 엔드포인트

| 항목 | 값 |
|---|---|
| Method · Path | `POST /api/workbench/save` |
| 가용 조건 | **개발 서버(`pnpm dev`)에서만.** `apply: 'serve'`이므로 `pnpm build` 산출물에는 존재하지 않음 |
| Content-Type | 요청·응답 모두 `application/json; charset=utf-8` |
| 최대 본문 | `MAX_BODY_BYTES = 64 * 1024 * 1024` (64 MiB). 초과 시 즉시 소켓 소비 중단 + `413` |

### 2.2 요청 스키마

```ts
/** tools/workbench-save/handler.mts */
export interface WorkbenchSaveFile {
  /** assets/ 기준 상대 경로. 반드시 `<디렉터리>/<파일명>.png` 2단 구조. */
  readonly path: string;
  /** `data:image/png;base64,…` 형식만 허용. */
  readonly dataUrl: string;
}

export interface WorkbenchSaveRequest {
  readonly manifest: AssetManifest;          // src/ui/core/assetManifest.ts:74
  readonly files: readonly WorkbenchSaveFile[];
  /** 기본 false. true면 매니페스트를 쓰지 않고 PNG만 기록. */
  readonly manifestOnly?: boolean;
}
```

**`files`를 `Record<string, string>`이 아니라 배열로 두는 이유** — 마스터 프롬프트는 딕셔너리를 지시했으나:
1. JSON 객체 키는 순서가 보장되지 않아 **응답의 `savedFiles` 순서가 비결정적**이 되고 테스트가 흔들린다.
2. 키에 한글·경로 구분자가 섞이면 `Object.prototype` 오염(`__proto__`, `constructor`) 검사를 별도로 해야 한다. 배열은 그 위험이 없다.
3. 동일 경로 중복을 **명시적으로 검출**할 수 있다(딕셔너리는 조용히 마지막 것만 남긴다).

**검증 스키마** — 기존 zod 관례를 따른다(`src/ui/core/assetManifest.ts`가 이미 zod 사용).

```ts
const ASSET_RELATIVE_PATH = /^[a-z]+\/[^/\\]+\.png$/u;   // 디렉터리 1단 + PNG 파일명
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/u;

export const WorkbenchSaveFileSchema = z.strictObject({
  path: z.string().regex(ASSET_RELATIVE_PATH),
  dataUrl: z.string().regex(PNG_DATA_URL).max(MAX_DATA_URL_CHARS),
});

export const WorkbenchSaveRequestSchema = z.strictObject({
  manifest: AssetManifestSchema,                       // 스키마 3.0 강제
  files: z.array(WorkbenchSaveFileSchema).max(256),
  manifestOnly: z.boolean().optional(),
});
```

### 2.3 응답 스키마

**성공 (200)**

```jsonc
{
  "ok": true,
  "assetsRoot": "dungeon-dossier/assets",
  "savedFiles": [                       // 실제로 디스크가 바뀐 파일만, 경로 오름차순
    "asset_manifest.json",
    "bg/배경_심문실_시안.png",
    "portraits/portrait_하피_base.png"
  ],
  "skippedFiles": [                     // 내용이 동일해 건너뛴 파일 (§2.6)
    "cards/card_기본_템플릿.png"
  ],
  "message": "3개 파일을 dungeon-dossier/assets/ 에 저장했습니다. (변경 없음 1개 건너뜀)"
}
```

**실패 (4xx/5xx)**

```jsonc
{
  "ok": false,
  "code": "E_PALETTE",
  "message": "bg/배경_심문실_시안.png: 불투명 색상이 312개입니다. 최대 16개까지만 저장할 수 있습니다.",
  "failures": [                          // 여러 건이면 전부 나열 (선검증이므로 가능)
    { "path": "bg/배경_심문실_시안.png", "code": "E_PALETTE", "message": "…" }
  ]
}
```

### 2.4 예외 처리 규격

| HTTP | `code` | 발생 조건 | PM에게 보이는 한국어 메시지(예) |
|---|---|---|---|
| 405 | `E_METHOD` | `POST` 이외 | `POST 요청만 지원합니다.` |
| 413 | `E_BODY_TOO_LARGE` | 본문 > 64 MiB | `저장 용량이 64MB를 넘습니다. 슬롯을 나눠 저장해 주세요.` |
| 400 | `E_JSON` | JSON 파싱 실패 | `요청 형식을 읽지 못했습니다.` |
| 400 | `E_SCHEMA` | zod 검증 실패 | `요청 스키마가 올바르지 않습니다: <zod path>` |
| 400 | `E_DUPLICATE` | `files`에 동일 `path` 2건 | `같은 경로가 중복 요청되었습니다: <path>` |
| 400 | **`E_FLAT_WRITE`** | `path`에 `/`가 없음 (assets 루트 직하) | `assets/ 루트에는 PNG를 저장할 수 없습니다. (레지스트리 키 충돌로 게임이 부팅되지 않습니다)` |
| 400 | `E_DIR` | 디렉터리가 화이트리스트 밖 | `허용되지 않은 폴더입니다: <dir> (허용: bg, cards, dead, evidence, fg, portraits, ui)` |
| 400 | **`E_PROTECTED`** | `ui/placeholder_missing_fallback.png` 덮어쓰기 시도 | `누락 에셋 대체 이미지는 덮어쓸 수 없습니다.` |
| 400 | `E_PATH` | `..`·절대경로·심볼릭 탈출 | `assets/ 밖으로 나가는 경로입니다.` |
| 400 | `E_FILENAME` | `category_name_state.png` 3분절 규칙 위반 | `파일명은 카테고리_이름_상태.png 형식이어야 합니다: <name>` |
| 400 | `E_DATA_URL` | data URL 접두사/Base64 불량 | `PNG data URL이 아닙니다: <path>` |
| 400 | `E_NOT_PNG` | PNG 시그니처·IHDR 불량 | `PNG 헤더를 읽지 못했습니다: <path>` |
| 400 | **`E_PALETTE`** | 불투명 색 > 16 | `불투명 색상이 N개입니다. 최대 16개까지만 저장할 수 있습니다.` |
| 500 | `E_WRITE` | fs 예외(EACCES, ENOSPC 등) | `디스크에 쓰지 못했습니다: <errno>` |

`E_FILENAME`은 `parseAssetFilename`(`src/ui/core/assetRegistry.ts:12-27`)과 **정확히 같은 규칙**을 서버에서 재확인한다 — 규칙을 어긴 파일이 디스크에 앉으면 다음 부팅에서 `Asset name must follow category_name_state.png` 예외로 게임이 죽기 때문이다.

### 2.5 경로 라우팅 계약

클라이언트가 `path`를 계산하고, 서버가 **독립적으로 재검증**한다(클라이언트를 신뢰하지 않는다).

```ts
/** workbench/model.mts (신규) */
export const ASSET_CATEGORY_DIRECTORIES = {
  '배경': 'bg',
  '전경': 'fg',
  'portrait': 'portraits',
  'card': 'cards',
  'ev': 'evidence',
  '아이콘': 'ui',
  'placeholder': 'ui',
  'dead': 'dead',
} as const satisfies Readonly<Record<string, string>>;

/** `배경_심문실_시안.png` → `bg/배경_심문실_시안.png` */
export function assetTargetPath(fileName: string): string | undefined;
```

* 이 표는 `tools/placeholder/placeholders.json`의 `category`/`directory` 짝과 **동일해야 하며**, §4.2의 테스트가 두 소스를 대조해 드리프트를 막는다.
* **디렉터리 화이트리스트는 이 표의 값 집합(7종)이며, `assets/` 실제 하위 폴더 목록이 아니다.** `fonts/`(woff2·md) · `bgm/` · `sfx/`(둘 다 `.gitkeep`만)는 PNG 대상이 아니므로 절대 포함하지 않는다 — 폴더를 열거해 카테고리로 삼는 구현은 `fonts/`를 저장 대상으로 노출시킨다.
* **`ui/placeholder_missing_fallback.png`는 덮어쓰기 금지 목록**에 넣는다. 이 파일은 `resolveAsset(…, fallback)`의 유일한 대체 이미지라, 손상되면 모든 누락 에셋이 "보이는 플레이스홀더"에서 "URL 없음"으로 퇴화한다(`src/app/bootstrap.ts` `runtimeAssetRegistry.get('placeholder/missing/fallback')`).

### 2.6 멱등성 — 동일 내용은 쓰지 않는다

기록 전 기존 파일을 읽어 바이트가 같으면 건너뛰고 `skippedFiles`에 넣는다.

이유: 워크벤치는 16슬롯 전부를 항상 전송하므로, 한 장만 교체해도 매번 16개 파일의 mtime이 바뀌어 **git이 전부 수정된 것처럼 보이고 Vite HMR이 불필요하게 전면 리로드**된다. 내용 비교로 실제 변경만 디스크에 반영한다.

---

## 3. Section 3 — UI Layout & Status Feedback

### 3.1 버튼 배치

마스터 프롬프트는 "툴바 **및** 인스펙터 패널 상단"에 추가하라고 지시하지만, **툴바 1곳에만 둔다.**
파괴적 디스크 쓰기를 두 군데서 노출하면 오작동 확률만 2배가 되고, 워크벤치의 기존 관례상 전역 동작(`#reset-all-geometry`)은 툴바에만 있다(`workbench/index.html:40`).

```
┌ .topbar ──────────────────────────────────────────────────────────────────┐
│ PLANNER ASSET WORKBENCH            ┌ .topbar-actions ────────────────────┐ │
│ 던전 수사 조서 · 심문 화면            │ [Tweak Mode ▢] [표시배율 2×HD ▼]     │ │
│ 640×400 → 1280×800 …                │ [전체 좌표 초기화]                    │ │
│                                     │ ┌─────────────────────────────────┐ │ │
│                                     │ │ 💾 프로젝트 assets/ 에 직접 저장 │ │ │ ← 신규
│                                     │ └─────────────────────────────────┘ │ │
│                                     └─────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

```html
<!-- workbench/index.html · .topbar-actions 말미, #reset-all-geometry 다음 -->
<button id="save-to-project" class="button button-save" type="button">
  💾 프로젝트 assets/ 에 직접 저장
</button>
```

### 3.2 CSS — 황금색 하이라이트

`--gold`/`--gold-bright`는 이미 정의돼 있고(`workbench/style.css:23-24`), 섹션 번호 뱃지가 `background: var(--gold)`를 쓰는 관례가 있다. 그 톤을 그대로 승계한다.

```css
/* workbench/style.css */
.button-save {
  border-color: var(--gold);
  background: linear-gradient(180deg, var(--gold-bright), var(--gold));
  color: #17140d;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.button-save:hover:not(:disabled) { background: var(--gold-bright); }

/* 전송 중에는 재클릭을 물리적으로 막는다 — 중복 POST는 곧 중복 디스크 쓰기다. */
.button-save:disabled { opacity: 0.55; cursor: progress; filter: saturate(0.4); }
```

### 3.3 상태 피드백 시나리오

전부 기존 `setStatus(message, isError)`(`workbench/main.mts:273-277`)를 통과하므로 `#save-status`의 `aria-live="polite"`가 그대로 스크린리더에 전달된다.

| 단계 | `#save-status` 텍스트 | `data-error` | 버튼 |
|---|---|---|---|
| 클릭 직후 | `프로젝트 폴더에 저장 중… (N개 파일)` | — | `disabled` |
| 성공 | `✅ PM 알림: N개 에셋이 dungeon-dossier/assets/ 에 저장되었습니다. 게임 탭은 새로고침해야 반영됩니다.` | — | 활성 |
| 성공(일부 무변경) | `✅ PM 알림: N개 저장 · M개는 변경이 없어 건너뜀.` | — | 활성 |
| 저장할 게 없음 | `저장할 이미지가 없습니다. 먼저 슬롯에 PNG를 올려 주세요.` | ✓ | 활성 |
| 검증 실패 | `❌ 저장 실패: <서버 message>` | ✓ | 활성 |
| 서버 부재(빌드본/404) | `❌ 저장 실패: 개발 서버에서만 사용할 수 있습니다. (pnpm dev)` | ✓ | 활성 |
| 네트워크 예외 | `❌ 저장 실패: <error.message>` | ✓ | 활성 |

* **개수 N은 응답의 `savedFiles.length`에서 계산한다.** 마스터 프롬프트 예시의 `"14개"`는 하드코딩 예시일 뿐이며, 실제 슬롯 충전 수에 따라 달라진다.
* 성공 메시지에 **"게임에 반영됨"이라고 쓰지 않는다** — 실제로 반영되는 것은 PNG뿐이고 `asset_manifest.json`은 기획 산출물이다(§0.4). 오해를 부르는 문구는 PM이 잘못된 확인을 하게 만든다.
* 404 판별: `response.status === 404`면 미들웨어가 없는 환경(프로덕션 프리뷰 등)이므로 전용 안내를 낸다.

### 3.4 클라이언트 핸들러 골격

```ts
/** workbench/main.mts */
let saving = false;

saveToProjectButton.addEventListener('click', () => {
  if (saving) return;                                   // 재진입 차단(1차)
  const request = collectWorkbenchSaveRequest(state);   // model.mts
  if (request.files.length === 0) {
    setStatus('저장할 이미지가 없습니다. 먼저 슬롯에 PNG를 올려 주세요.', true);
    return;
  }
  saving = true;
  saveToProjectButton.disabled = true;                  // 재진입 차단(2차)
  setStatus(`프로젝트 폴더에 저장 중… (${request.files.length}개 파일)`);
  void postWorkbenchSave(request)
    .then((result) => setStatus(formatSaveSuccess(result)))
    .catch((error: unknown) => setStatus(`❌ 저장 실패: ${describeSaveError(error)}`, true))
    .finally(() => {
      saving = false;
      saveToProjectButton.disabled = false;
    });
});
```

`collectWorkbenchSaveRequest` / `formatSaveSuccess` / `describeSaveError`는 **DOM을 만지지 않는 순수 함수**로 `workbench/model.mts`에 두어 §4.2에서 그대로 단위 테스트한다.

---

## 4. Section 4 — Verification & Integration Tests

### 4.1 테스트 가능성이 설계를 결정한다

이 저장소에는 **vite 플러그인을 직접 실행하는 테스트가 하나도 없고**, vitest는 `environment: "node"`로 돌아 dev 서버를 띄우지 않는다. 따라서:

* `vite.config.ts`에 핸들러를 인라인으로 작성하면 **영원히 테스트되지 않는다.**
* 핸들러를 `tools/workbench-save/handler.mts`의 **순수 함수 `handleWorkbenchSave(request, options)`**로 분리하면, `assetsRoot`를 `mkdtemp` 임시 폴더로 주입해 실제 파일 입출력을 검증할 수 있다.
* connect 미들웨어 어댑터(`req`/`res` 처리)는 얇은 껍데기로 남기고, 그 껍데기만 최소한의 req/res 목으로 검증한다.

```ts
export interface WorkbenchSaveOptions {
  /** 기본값은 저장소의 assets/. 테스트가 임시 폴더로 대체한다. */
  readonly assetsRoot: string;
}
export async function handleWorkbenchSave(
  input: unknown,
  options: WorkbenchSaveOptions,
): Promise<WorkbenchSaveResult>;   // { status, body }
```

### 4.2 신규 테스트 목록

> **⚠️ 테스트 디렉터리 함정**: `package.json:18`의 `test:gates`는 디렉터리를 **이름으로 열거**한다(`tests/ai … tests/ui`). 새 최상위 폴더 `tests/tools/`를 만들면 `pnpm test`(글롭)에는 잡히지만 **`pnpm test:gates`에서는 조용히 빠진다.** 따라서 아래 두 파일을 추가하면서 `test:gates` 스크립트에 `tests/tools`를 **함께 추가**한다(1줄). 이것을 잊으면 게이트 스크립트만 도는 CI 경로에서 본 기능이 무검증 상태가 된다.

| 테스트 파일 | 종류 | 단언 |
|---|---|---|
| `tests/tools/workbench-save-handler.test.ts` | 통합(Node fs) | **정상 경로**: 임시 `assetsRoot`에 `bg/…png`·`portraits/…png`·`asset_manifest.json`이 실제로 생성되고, PNG 바이트가 입력 Base64와 **정확히 일치**하며, 매니페스트가 `JSON.stringify(…, null, 2)` 포맷인지 |
| ″ | 통합 | **디렉터리 자동 생성**: 존재하지 않는 `assetsRoot`/하위 폴더가 `mkdir(recursive)`로 생성되는지 |
| ″ | 통합 | **멱등성**: 같은 요청 2회 → 2회차는 `savedFiles: []`, `skippedFiles`에 전부, mtime 불변 |
| ″ | 통합 | **원자성**: 3개 중 1개가 `E_PALETTE`면 **디스크에 0개** 기록 + 400 + `failures`에 실패 건만 |
| ″ | 단위 | **경로 방어 매트릭스**: `../../etc/passwd`, `/abs/x.png`, `bg/../../x.png`, `배경_심문실_시안.png`(평면), `nope/x.png`(화이트리스트 밖), `bg/파일.jpg`, `bg/두분절.png` → 각각 `E_PATH`/`E_FLAT_WRITE`/`E_DIR`/`E_SCHEMA`/`E_FILENAME`이고 **임시 폴더 밖에 어떤 파일도 생기지 않았음** |
| ″ | 단위 | **`E_DUPLICATE`**: 동일 `path` 2건 요청 거부 |
| ″ | 단위 | **`E_PROTECTED`**: `ui/placeholder_missing_fallback.png` 덮어쓰기 거부 |
| ″ | 단위 | **`E_METHOD`/`E_BODY_TOO_LARGE`/`E_REMOTE`**: 어댑터가 405·413·403을 내는지. req/res는 이 레포 최초의 목이므로 `interface RequestDouble { … }` + `vi.fn()` 구조체로 손수 작성한다(§0.1 "미들웨어 선례 없음") |
| ″ | 회귀 | **경로 구분자**: Windows에서 생성된 `savedFiles` 항목이 전부 `/` 정규화돼 있는지(§0.6-6) |
| `tests/ui/workbench-save-request.test.ts` | 단위(모델) | `assetTargetPath()`가 8개 카테고리 전부를 올바른 폴더로 보내고 미지 카테고리에 `undefined`를 돌려주는지 · `collectWorkbenchSaveRequest()`가 빈 슬롯을 제외하고 캐릭터 바인딩 슬롯을 `characterPartFileName`으로 명명하는지 · `formatSaveSuccess`/`describeSaveError` 문구 |
| ″ | 회귀 | **드리프트 방어**: `ASSET_CATEGORY_DIRECTORIES`가 `tools/placeholder/placeholders.json`의 `category→directory` 짝과 **완전 일치**하는지 |
| ″ | 회귀 | **레지스트리 안전성**: `collectWorkbenchSaveRequest`가 만든 모든 `path`를 현재 `assets/` 실측 목록과 합쳐 `buildAssetRegistry()`에 통과시켰을 때 `Duplicate asset slot`이 **발생하지 않는지** (§0.2의 사고를 테스트로 고정) |
| `tests/ui/workbench-model.test.ts` (기존) | 회귀 | 기존 16슬롯·매니페스트 단언 그린 유지 |

### 4.3 게이트 실행 순서

```bash
corepack pnpm typecheck        # vite.config.ts + tools/**/*.mts 포함 (tsconfig.node.json)
corepack pnpm lint             # tools/**/*.mts 는 **/*.{ts,mts} 규칙 적용
corepack pnpm test             # 신규 2파일 포함 전체 vitest
corepack pnpm content:validate
corepack pnpm palette:check    # ★ 본 기능이 직접 위협하는 게이트 (§0.3)
corepack pnpm build            # apply:'serve' 플러그인이 번들에 새지 않았는지
```

> `pnpm check`는 내부에서 bare `pnpm`을 호출하므로 corepack 셸에서는 실패한다. 위 6개를 개별 실행한다.

### 4.4 수동 검증 시나리오 (PM 관점)

1. `pnpm dev` → `/workbench/` 접속.
2. `취조실 배경` 슬롯에 **16색 이하** PNG 드롭 → `[💾 프로젝트 assets/ 에 직접 저장]` 클릭.
3. `assets/bg/배경_심문실_시안.png`의 mtime과 내용이 바뀌었는지, `assets/` **루트에 PNG가 생기지 않았는지** 확인.
4. 같은 버튼을 한 번 더 클릭 → `변경 없어 건너뜀` 안내가 뜨고 mtime이 그대로인지 확인(멱등성).
5. 게임 탭(`/`)을 새로고침 → 심문 화면 배경이 교체된 PNG로 보이는지 확인.
6. 풀컬러 사진 PNG를 올리고 저장 → `❌ 저장 실패: … 불투명 색상이 N개입니다` 안내가 뜨고 **디스크가 그대로인지** 확인.
7. `pnpm palette:check` · `pnpm build` 그린 확인.
8. `git status`에 의도한 파일만 수정으로 나타나는지 확인.

---

## 5. 보안·안전 규격

| 위협 | 대응 |
|---|---|
| 경로 탈출(`../`, 절대경로) | `resolveOutputSubdirectory`와 동일 기법(`path.resolve` 후 `path.relative`가 `..`로 시작하는지) + 디렉터리 화이트리스트 이중 방어 |
| 임의 파일 덮어쓰기 | 확장자 `.png` 고정, 디렉터리 화이트리스트 7종, 파일명 3분절 규칙 — 세 조건을 **모두** 만족해야 기록 |
| 프로덕션 노출 | `apply: 'serve'`. 빌드 산출물에 미들웨어 자체가 존재하지 않음 |
| 외부 네트워크 노출 | `server.host: true`가 이미 설정돼 있어 **LAN에 열려 있다**. 본 엔드포인트는 임의 파일 쓰기이므로, 핸들러 진입 시 `req.headers.host`의 호스트가 루프백(`localhost`/`127.0.0.1`/`[::1]`)인지 확인하고 아니면 `403 E_REMOTE`를 반환한다 |
| CSRF(브라우저가 다른 사이트에서 POST) | `Content-Type: application/json` 필수 + `Sec-Fetch-Site` 헤더가 `same-origin`이 아니면 거부. JSON 본문은 단순 요청(simple request)이 아니므로 프리플라이트가 강제된다 |
| 디스크 고갈 | 본문 64 MiB · 파일 256개 상한 |
| 부분 저장 | 선검증 + `write tmp → rename` (§1.2) |

---

## 6. 구현 순서 (권장 커밋 단위)

| 단계 | 내용 | 파일 | 규모 | 의존 |
|---|---|---|---|---|
| **W1** | 경로 라우팅 + 요청 조립 순수 함수 | `workbench/model.mts`, `tests/ui/workbench-save-request.test.ts` | ~140줄 | 없음 |
| **W2** | 서버 핸들러(검증·기록·멱등) | `tools/workbench-save/handler.mts`, `tests/tools/workbench-save-handler.test.ts` | ~320줄 | W1(스키마 공유) |
| **W3** | 미들웨어 어댑터 + 플러그인 등록 | `tools/workbench-save/index.mts`, `vite.config.ts` | ~90줄 | W2 |
| **W4** | 버튼 UI·CSS·상태 연출 | `workbench/index.html`, `workbench/style.css`, `workbench/main.mts` | ~110줄 | W1, W3 |

W1·W2는 브라우저 없이 검증 가능하므로 먼저 완결한 뒤 W3·W4로 배선한다.

---

## 부록 A. 파일별 변경 총괄표

| 파일 | 신규/수정 | 내용 |
|---|---|---|
| `tools/workbench-save/handler.ts` | **신규** | `handleWorkbenchSave()` — 검증·라우팅·원자적 기록. Node 전용, 순수 주입형. **확장자 `.ts` 필수**(§0.6-2) |
| `tools/workbench-save/index.ts` | **신규** | `saveWorkbenchAssetsPlugin()` — `apply:'serve'` + `configureServer` 어댑터 |
| `vite.config.ts` | 수정 | `plugins` 배열에 `saveWorkbenchAssetsPlugin()` 1줄 추가 |
| `package.json` | 수정 | `test:gates`에 `tests/tools` 추가 (§4.2 함정) |
| `workbench/model.mts` | 수정 | `ASSET_CATEGORY_DIRECTORIES`, `assetTargetPath()`, `collectWorkbenchSaveRequest()`, `formatSaveSuccess()`, `describeSaveError()` |
| `workbench/index.html` | 수정 | `.topbar-actions`에 `#save-to-project` 버튼 |
| `workbench/style.css` | 수정 | `.button-save` (+`:hover`, `:disabled`) |
| `workbench/main.mts` | 수정 | 버튼 참조·클릭 핸들러·`postWorkbenchSave()` fetch |
| `tests/tools/workbench-save-handler.test.ts` | **신규** | §4.2 통합·방어 매트릭스 |
| `tests/ui/workbench-save-request.test.ts` | **신규** | §4.2 모델·드리프트·레지스트리 안전성 |

---

## 부록 B. 마스터 프롬프트 대비 조정 사항 (근거 포함)

| 프롬프트 원문 | 조정 | 근거 |
|---|---|---|
| "`assets/` 폴더 내 개별 PNG 파일로 덮어쓰기 기록" | **카테고리 하위 폴더로 라우팅**하고 루트 직하 기록은 `E_FLAT_WRITE`로 거부 | §0.2 — `buildAssetRegistry`가 `Duplicate asset slot`을 던져 **게임이 부팅되지 않는다** |
| 핸들러 로직을 `vite.config.ts`에 작성 | 로직은 `tools/workbench-save/handler.mts`, config는 1줄 위임 | §4.1 — 이 저장소에 vite 플러그인을 실행하는 테스트 관용구가 없어 인라인은 영구 미검증이 된다 |
| `files: Record<string, string>` | `files: WorkbenchSaveFile[]` | §2.2 — 키 순서 비결정성·프로토타입 오염·중복 무음 삭제 회피 |
| 검증 없이 Buffer 기록 | **선검증 5단계**(경로·data URL·PNG 헤더·파일명 규칙·팔레트) 후 일괄 기록 | §0.3 — 팔레트 위반 시 `pnpm palette:check` 게이트가 즉시 레드. §1.2 — 부분 저장 방지 |
| 성공 메시지 `"14개 에셋이 …"` | 개수를 `savedFiles.length`에서 산출 | 실제 충전 슬롯 수는 가변. 하드코딩은 곧 거짓 보고 |
| "툴바 **및** 인스펙터 패널 상단"에 버튼 | **툴바 1곳** | §3.1 — 파괴적 동작의 중복 노출은 오작동만 2배. 기존 전역 동작(`#reset-all-geometry`)도 툴바 단독 |
| (미언급) | **루프백 호스트 검사 + `Sec-Fetch-Site` 검사** 추가 | §5 — `server.host: true`(`vite.config.ts:79`)로 LAN에 열려 있어 임의 파일 쓰기가 외부에 노출된다 |
| (미언급) | **멱등 저장**(내용 동일 시 건너뜀) | §2.6 — 16슬롯 전량 전송 구조라 매 저장이 전 파일 mtime을 바꿔 git·HMR을 오염시킨다 |
| (미언급) | `asset_manifest.json`은 **기획 산출물**임을 UI 문구에 반영 | §0.4 — 런타임은 파일명 글롭만 사용하며 매니페스트를 읽지 않는다 |
| 서버 모듈을 `.mts`로 (워크벤치 관례 유추) | **`.ts`로 강제** | §0.6-2 — `tsconfig.node.json` include가 `tools/**/*.ts`뿐이라 `.mts`는 타입 사각지대 |
| (미언급) | `ui/placeholder_missing_fallback.png` **덮어쓰기 금지**(`E_PROTECTED`) | 유일한 누락-에셋 대체 이미지. 손상 시 모든 폴백이 URL 없음으로 퇴화 |
| (미언급) | 디렉터리 화이트리스트는 **카테고리 표의 값 7종**, 폴더 열거 금지 | `assets/fonts`·`bgm`·`sfx`는 PNG 대상이 아님 |
| (미언급) | `test:gates` 스크립트에 `tests/tools` 추가 | §4.2 — 디렉터리 이름 열거식이라 신규 폴더는 게이트에서 조용히 누락 |
| (미언급) | 성공 문구에 **"게임 탭 새로고침 필요"** 명시 | §0.5 — `import.meta.hot` 0건이라 HMR이 아닌 전체 리로드이며, 자동 반영되지 않는다 |
