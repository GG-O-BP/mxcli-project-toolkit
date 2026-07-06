# mxcli-project-toolkit 프로젝트 전체 개요

> 이 문서는 저장소 전체(문서·스킬·파이프라인 코드·운영 지식)를 분석하여 작성한 종합 설명서입니다.
> 빠른 시작과 규칙 중심의 안내는 `README.md`를, 이 저장소에서 작업하는 에이전트용 컨텍스트는 `CLAUDE.md`를 참고하세요.

---

## 1. 이 프로젝트는 무엇인가

**mxcli-project-toolkit**은 레거시 애플리케이션(OutSystems, Java/Spring Boot + Angular 등)을 **Mendix 로우코드 플랫폼으로 마이그레이션**하는 프로젝트들이 공유하는 **도구 + 지식 저장소**입니다. 세 가지가 들어 있습니다.

1. **스킬 문서(`skills/`)** — 마이그레이션의 각 단계를 수행하는 방법을 정리한 절차서·프롬프트 템플릿 모음. AI 에이전트(Claude)가 작업 종류에 따라 필요한 파일만 로드해서 사용합니다.
2. **추출 파이프라인(`pipelines/`)** — 소스 코드를 AST 수준에서 파싱해 구조화된 지식 베이스(KB JSON)와 요구사항 문서(BRD JSON)를 자동 생성하는 Node.js 도구.
3. **운영 지식(`bug-logs/`, `process/`, `examples/`)** — mxcli CLI의 알려진 버그와 우회법, 실제 프로젝트 회고에서 나온 프로세스 개선안, 실전 마이그레이션 예제.

핵심 설계 사상은 **"한 번 클론, 모든 프로젝트가 참조"** 입니다. 각 마이그레이션 프로젝트는 이 저장소를 표준 위치(예: `~/Mendix/mxcli-project-toolkit`)에 클론해 두고 자기 `CLAUDE.md`에서 참조만 합니다. 복사본이 없으므로 버전이 어긋나지 않고, `git pull` 한 번으로 모든 프로젝트가 최신 지식을 받습니다. 반대로 **프로젝트 산출물(`analysis/`, `sources/`, `knowledge-base/`, `*.mpr`, 빌드 계획, 세션 노트)은 절대 이 저장소에 들어오지 않습니다** — `.gitignore`로 강제되며, 재사용 가능한 패턴만 `skills/learned-*.md`로 승격됩니다.

### 먼저 알아야 할 핵심 용어

| 용어 | 의미 |
|------|------|
| **mxcli** | Mendix 프로젝트 파일(`.mpr`)을 CLI로 조작하는 도구. MDL 스크립트를 `mxcli exec`로 실행해 엔티티·마이크로플로우·페이지를 생성합니다. |
| **MDL** | mxcli의 스크립트 언어. `CREATE ENTITY`, `CREATE MICROFLOW` 등으로 Mendix 모델을 코드로 기술합니다. |
| **BRD** | Business Requirements Document. 기능 영역 단위(`F{NNN}-{topic}.brd.json`)의 구조화된 JSON으로, `useCases`, `domainEntities`, `microflows`, `pages`, `integrations`, `openQuestions` 배열을 담습니다. 파이프라인이 스캐폴드를 자동 생성하고 사람이 보강하며, 최종적으로 MDL 스크립팅의 직접 입력이 됩니다. |
| **KB** | Knowledge Base. 두 종류가 있습니다 — 코드 KB(파이프라인이 추출한 `entities.json`, `logics.json`, `screens.json` 등)와 문서 KB(Excel/Word/PDF 사양서에서 추출한 `KB_*.md`). |
| **CE 에러** | Mendix 모델 일관성 오류(Consistency Error). 빌드 게이트의 1차 기준이 "CE 에러 0"입니다. |
| **Baseline routing** | 상황과 무관하게 **모든** MDL 작성 세션에 적용되어야 하는 스킬 목록. 새 프로젝트의 `CLAUDE.md`에 그대로 복사해 넣어 "우연히 발견되기를 기대하는" 누락을 방지합니다. |

---

## 2. 저장소 구조

```
mxcli-project-toolkit/
├── README.md                 ← 메인 안내서: 마이그레이션 흐름(0~6단계), 스킬 라우팅 표,
│                                Baseline routing, stale 빌드 금지 규칙, 소비 모델
├── CLAUDE.md                 ← 이 저장소에서 작업하는 에이전트용 컨텍스트(스킬 로드 표)
├── skills/                   ← 27개 스킬 문서 (아래 4장 참조)
├── pipelines/                ← 소스별 추출 파이프라인 (Node.js, 아래 5장 참조)
│   ├── outsystems/           ← OutSystems 11 eSpace XML → KB → BRD (+ sample-outputs/)
│   └── java-angular/         ← Spring Boot + Angular → KB → BRD
├── examples/
│   └── outsystems-migration/ ← 실전 예제: OS 모듈 112개 → Mendix 모듈 14개 계획,
│                                단일 모듈(PayerRegistration) 빌드 루프 기록
├── bug-logs/
│   ├── mxcli-bugs.md         ← mxcli/MDL 버그 카탈로그 (BUG-01~19, 재현·원인·우회법)
│   └── bug-log-apex-m0022.md ← 프로젝트별(Apex M-0022) E2E 테스트 버그 로그
└── process/
    ├── process-learnings.md  ← POC 회고: 성공/실패 요인과 프로세스 게이트 개선안
    └── test-plan-apex-m0022.md ← 구조화된 테스트 계획 예시
```

---

## 3. 마이그레이션 표준 흐름 (0~6단계)

모든 마이그레이션은 소스 스택과 무관하게 같은 단계를 거치며, 각 단계에 담당 스킬이 하나씩 배정되어 있습니다.

```
0. TRIAGE (선별)          ─ source-triage.md, assess-migration.md
   추출 파이프라인을 돌릴지, 수동 평가로 갈지, 범위를 어디까지 한정할지 결정하는 게이트.
   승인 전에는 BRD 생성 시작 금지.
        ▼
1. ANALYSIS (분석)        ─ migration-pipeline.md, source-*.md, kb-generation.md
   경로 A: 소스 코드 → 추출 JSON / 경로 B: 비즈니스 문서 → KB 마크다운 (병렬 가능)
        ▼
2. REQUIREMENTS (요구사항) ─ brd-generation.md, brd-validation.md
   KB + 추출 JSON → 검증된 모듈별 BRD JSON
        ▼
3. ARCHITECTURE & DESIGN  ─ modularize-domain.md → architecture-blueprint.md
   (아키텍처·설계)            + design-artifacts.md (병렬)
   모듈 경계 결정 → 구조 다이어그램 + UI/브랜드 레이어
        ▼
4. BUILD PLAN (빌드 계획)  ─ brd-to-build-plan.md
   BRD + 아키텍처 → 의존성 순서로 번호 매겨진 스크립트 계획
        ▼
5. BUILD (빌드)           ─ iterative-build-loop.md, mdl-cookbook-microflows.md,
   한 번에 한 모듈씩,        bug-logs/mxcli-bugs.md
   게이트 검증을 거치며 MDL 실행
        ▼
6. TEST (테스트)          ─ e2e-harness-base.md
   Playwright E2E + DB 검증
```

의도된 설계 원칙 두 가지가 흐름 전체를 관통합니다.

- **0~4단계에서는 mxcli를 전혀 건드리지 않습니다.** 잘못된 모듈 경계는 40개의 MDL 스크립트가 만들어진 뒤 고치는 것보다 다이어그램 단계에서 고치는 편이 훨씬 저렴하기 때문입니다.
- **`assess-migration`(AI 수동 인벤토리)과 추출 파이프라인(AST 자동 추출)은 대체재가 아니라 상호 검증 도구입니다.** 둘의 출력 불일치(AI는 찾았는데 추출기가 놓친 규칙 등)가 바로 선별 단계가 드러내도록 설계된 간극입니다.

참고로 `skills/migration-pipeline.md` 내부에서는 같은 흐름을 Phase 1~7 번호 체계로 서술합니다(1 소스 분석 → 2 코드 추출 → 3 BRD 스캐폴딩 → 4 문서 KB → 5 BRD 검증 → 6 Mendix 재설계 → 7 MDL 생성). README의 0~6단계와 내용은 대응되지만 번호가 다르므로 혼동에 주의하세요.

---

## 4. 스킬 체계 (`skills/`)

27개 스킬은 성격에 따라 네 그룹으로 나뉩니다. **필요할 때만 로드하는 온디맨드 방식**이 원칙이며, 어떤 작업에 어떤 스킬을 읽을지는 README/CLAUDE.md의 라우팅 표가 정의합니다.

### 4-1. 마이그레이션 핵심 스킬

| 파일 | 역할 |
|------|------|
| `migration-pipeline.md` | 전체 파이프라인 오케스트레이션 가이드(Phase 1~7). 플랫폼 식별부터 MDL 생성까지의 의존성 흐름 정의 |
| `source-triage.md` | Phase 2/3 전 **필수 게이트**: 수동/파이프라인 재사용/신규 구축 결정, 커버리지 매트릭스, 범위 추천(사용자 승인 필수) |
| `assess-migration.md` | 수동 기술 평가 템플릿: 기술 스택·데이터 모델·비즈니스 로직·통합·보안을 표로 인벤토리 |
| `migrate-general.md` | 소스 무관 마이그레이션 기초: 설계 순서(도메인→페이지 스케치→로직), 레이어화 스크립트, Stub 패턴, 명명 규칙(`ACT_`/`GET_`/`VAL_`/`SUB_`/`STUB_`) |
| `migrate-outsystems.md` | OutSystems 특화 가이드: XML 추출 → BRD 스캐폴딩 프롬프트 시퀀스 |
| `source-os11.md` | OS 11 개념 → Mendix 개념 변환표, 모듈 분류(M/C/T 접두사), 감사 필드 표준(8개) |
| `os-xml-schema.md` | OS eSpace XML 구조 상세(Entity/Action/WebScreen/Role 등)와 파서 주의사항 |

### 4-2. BRD / 지식베이스 스킬

문서 발견 → KB 생성 → BRD 생성 → 검증 → 빌드 계획으로 이어지는 지식 구조화 체인입니다.

| 파일 | 역할 |
|------|------|
| `document-discovery.md` | 비정형 문서 폴더 재귀 스캔 → 6개 범주 분류(document/source-code/DB/sensitive 등) → Tier A/B/C 우선순위 → 사용자 승인 |
| `kb-generation.md` | Excel/Word/PDF 사양서(주로 일본어)를 구조화된 영어 마크다운 `KB_{SourceCode}_{Topic}.md`로 변환 |
| `brd-generation.md` | BRD JSON 작성·보강 템플릿. 파일명 규칙 `F{NNN}-{kebab-topic}.brd.json` |
| `brd-validation.md` | BRD를 코드 KB와 문서 KB 양쪽에 대조 검증: 중복 엔티티, 충돌 규칙, 고아 개념, 깨진 관계 감지 → 반복 수정 사이클 |
| `modularize-domain.md` | Mendix 모듈 경계 결정. **소스 구조 1:1 복사 금지**, 경계 기준(Bounded Context/Reuse/Lifecycle/Security/Size) 중 최소 1개 충족 시에만 별도 모듈, 아니면 기본값 = 한 모듈 + 폴더. 사용자 승인 체크포인트 |
| `brd-to-build-plan.md` | 검증된 BRD + 아키텍처 → 의존성 순서(Common → Domain+Logic → Feature → Integration)의 번호 매겨진 스크립트 계획. 스크립트 입도, Stub/Real 경계, 데모 사용자-역할 매핑까지 서면 확정 |

BRD는 **살아있는 문서**입니다: MDL 스크립팅 중 발견된 모호함은 `openQuestions`에 기록하고 해결 후 BRD를 갱신하며, 사람이 보강한 BRD는 파이프라인 재실행 시 덮어쓰지 않고 `.scaffold.json`으로 우회 저장해 보호합니다.

### 4-3. 빌드/개발 프로세스 스킬

| 파일 | 역할 |
|------|------|
| `mdl-cookbook-microflows.md` | 실무 마이크로플로우 5종의 완전한 MDL 코드(DTO 빌더, 검증 게이트, 객체 그래프, 오케스트레이션, 깊은 XPath) + 10개 핵심 패턴(Guard-early-return, Accumulate-all-errors 등) |
| `iterative-build-loop.md` | 모듈별 **12단계 빌드 루프**: 스크린 분석 → 체크리스트 추출 → 마이크로플로우/페이지 → BSON 검증 → 해피 패스 → 커버리지 완료. MPR+mprcontents 스냅샷, CE 에러 분류 포함 |
| `e2e-harness-base.md` | Playwright E2E 하네스: `helpers.js` 공유 라이브러리(로그인/네비게이션/DB 어설션) + 6종 테스트 스위트(DB 스모크→검증→부분 입력→해피 패스→견고성→데모) |
| `qa-loop-goal-pattern.md` | 추출기-매퍼 파이프라인을 지상 진실(architecture.md)과 필드 수준으로 반복 대조 검증. "크래시 없음 ≠ 품질" 원칙 |
| `architecture-blueprint.md` | 모듈 정의 → Mermaid 다이어그램 → 의존성 그래프 → fit-gap 분석(Native/Config/Buy/Build/Workaround/Gap) → 오픈이슈 레지스터 |
| `design-artifacts.md` | 디자인 시스템(토큰+컴포넌트+Atlas 매핑) → 스크린 인벤토리 → 바인딩 어노테이션이 달린 와이어프레임 |
| `agent-roles.md` | 서브에이전트 3역할 분담 — mdl-agent(MDL 작성+check), gate-agent(빌드 게이트), test-agent(UI 테스트). **`.mpr` 변경(`mxcli exec`)은 메인 세션만** 수행 |
| `bootstrap-project.md` | 새 프로젝트의 `CLAUDE.md` 생성 절차: 프로젝트 사실 수집 → Baseline routing 복사 → 상황별 라우팅 행 선택 → 사용자 승인 |

빌드 게이트의 진짜 기준은 "CE 에러 0"이 아니라 **"CE 에러 0 + 해피 패스(데모 사용자로 전체 흐름 통과) + 전체 필드 커버리지(원본 스크린샷 대비)"** 3단계입니다 — 하나라도 생략하면 "완료" 표시 뒤에 불완전한 상태가 숨습니다(M-0022 POC 회고에서 확립된 교훈).

### 4-4. Learned 스킬 (`learned-*.md`)

실제 프로젝트(주로 IVM)에서 검증된 패턴을 승격한 파일들입니다. 이론이 아니라 구체적 에러 코드(CE0056, BUG-15b 등)와 실전 사례를 담습니다.

| 파일 | 핵심 내용 |
|------|-----------|
| `learned-microflow-patterns.md` | MDL 마이크로플로우 규율 15가지: 파라미터 `$` 금지, `$currentUser` vs `[%CurrentUser%]`, NPE(비영속 엔티티) Dto 제약, XPath 리트리브 가드 등 — **Baseline routing 항목** |
| `learned-page-patterns.md` | 페이지 빌드 실패 사례 8가지: 버튼 Caption 필수, Forward reference 금지, DataView Context 선호 등 |
| `learned-process.md` | 빌드 프로세스 규율: 위젯 참조 전체 맥락 표기, CE 에러 5단계 트리아주, MPR 자동 백업 |
| `learned-db-assertions.md` | mxcli OQL `--direct`가 Mendix 11.10+에서 막힌 문제를 psql 직접 쿼리로 우회하는 DB 검증 패턴(`module$entity` 명명 규칙 포함) |
| `learned-skill-migrate-general.md` | OS 11→Mendix 마이그레이션 전체 프레임 9섹션(설계 순서, 계층화, Stub, 개념 매핑) |
| `learned-skill-scope-delta.md` | 코드 추출 결과 vs 비즈니스 요구사항의 갭 비교 스킬 — "코드 생성에 영향을 주는 갭만" 기록 |
| `learned-skill-ux-audit.md` | 디자인 시스템 vs 라이브 앱 UX 감사(5개 Phase, Playwright 스크린샷 기반). stale 빌드 방지 hard gate 포함 |

---

## 5. 추출 파이프라인 (`pipelines/`)

두 파이프라인은 **약 95%의 코드를 공유하는 자매 프로젝트**로, 동일한 3단계 아키텍처를 따릅니다. 소스별로 다른 것은 추출기(extractor)와 링커 규칙뿐이고, 병합기·BRD 매퍼·보고서 생성기는 거의 동일합니다.

### 공통 아키텍처

```
Phase 1  샘플링       node run.js 1   파일 구조 스캔 → schema.json (전체 추출 전 구조 검증)
Phase 2  추출 + 병합   node run.js 2   추출기 병렬 실행 → extracted/*.json
                                       → merger.js: 중복 제거 + 교차 참조 링크
                                       → knowledge-base/*.json (entities, logics, screens …)
Phase 3  BRD 생성     node run.js 3   모듈별로 5개 매퍼 실행 → {module}.brd.json
(Phase 4  사람 보강)                   use case 내러티브·비즈니스 규칙 수동 작성 → 보고서 갱신
```

- **매퍼 5종(공통)**: `domain-entity-mapper`(엔티티→PersistentEntity/Enumeration), `microflow-mapper`(로직→Microflow/Nanoflow), `page-mapper`(스크린→Page, UI 패턴 유추), `use-case-mapper`(유스케이스 스캐폴드 + 자동 오픈 질문), `integration-mapper`(REST/외부 엔티티). 모두 파일 I/O 없는 순수 함수라 모듈별 병렬 실행이 가능합니다.
- **신뢰도 자동 산정**: 미해석 참조(gap) 수 기준 0개→high, 1~3개→medium, 4개 이상→low. BRD 리뷰 우선순위로 사용됩니다.
- **보강 보호 장치**: 재실행 시 기존 BRD에 리뷰 흔적(`reviewStatus`, doc-confirmed)이 있으면 새 스캐폴드를 `.brd.scaffold.json`으로 따로 저장해 사람 작업을 덮어쓰지 않습니다.
- **보고서**: `extraction-report.html`(기술 대시보드: 원시 항목·모듈별 분류·gap 목록)과 gaps 리포트를 생성합니다.
- **설정**: `pipeline/config.json`은 placeholder로 배포됩니다. 클론 후 로컬 소스 경로를 넣되 절대 커밋하지 않으며, `knowledgeBaseDir`은 반드시 **프로젝트 워크스페이스의** `analysis/knowledge-base`를 가리켜야 합니다(파이프라인 자신의 디렉토리 금지).

### 5-1. OutSystems 파이프라인 (`pipelines/outsystems/`)

구 독립 저장소 `os-migration-pipeline`을 히스토리째 이관한 것입니다.

- **입력**: OS 11 eSpace `.xml`(필수) + C#/JavaScript/DB 스키마/Excel/문서(선택 — 없으면 해당 추출기는 건너뜀).
- **추출기 6종**: `xml-extractor.js`(핵심 — Entity, Logic, Screen, WebBlock, ServiceAction, Timer, Process, Role, Structure, StaticEntity 전부, fast-xml-parser 기반), `cs-extractor.js`/`js-extractor.js`(스텁), Python 기반 db/excel/doc 추출기.
- **교차 참조 해석 2단계**: `key-resolver.js`가 전체 XML을 순회해 OS 내부 키(`ActionReference:xxx`, `Entity:xxx` 등)의 글로벌 맵 5종을 구축하고, `linker.js`가 링크 규칙 6+6개(R1~R6 + XML 전용 X1~X6)로 아이템 간 `linkId`를 매칭합니다. 미해석 참조는 gap으로 기록되고, OS 플랫폼 엔티티(User/Group/Role)는 자동 필터링됩니다.
- **참고 자료**: `sample-outputs/`에 실제 BRD 예제(F001~F008)와 요약 보고서, `pipeline-guide.html`에 대화형 가이드가 있습니다.

### 5-2. Java + Angular 파이프라인 (`pipelines/java-angular/`)

- **입력**: Spring Boot Java 소스 + Angular TypeScript 소스.
- **추출기**: `java-extractor.js`가 tree-sitter-java로 `@Entity`/`@Service`/`@RestController` 클래스를 파싱해 entity/logic/enum을 추출하고, JPA 관계(`@ManyToOne` 등)를 합성 FK 속성으로 표현해 기존 매퍼를 그대로 재사용합니다. `angular-extractor.js`는 tree-sitter-typescript로 `@Component`를 파싱해 screen을 만들고, `'api/items' + id` 식 문자열 연결이나 템플릿 리터럴로 조립된 API 경로를 재귀 재구성(`/api/items/*/itemActions` 형태로 보존)하며, `*.service.ts` 분석으로 HTTP 동사까지 명시합니다.
- **링커 규칙 J1~J6**: FK 이름 매칭, Repository 명명 규칙(`itemRepository.*` → Item 엔티티), 동일 모듈 메서드 호출, API 경로+동사 매칭, 다이얼로그 발사, 템플릿 컴포지션. 엔진 구조는 OS와 같지만 규칙은 스택에 맞게 전면 재작성되었습니다.
- **차별 기능 — 숨은 규칙 자동 감지**(`detectHiddenRules`): 예외 던짐, PUT+orElseGet(upsert 신호), 한 메서드 안의 다중 repository delete(코드 수준 cascade delete)를 기계적으로 표시합니다. "왜"를 추론하지 않고 "무엇을 하는가"만 기록해 사람 리뷰로 넘깁니다.
- **검증 이력**: `SESSION-NOTES.md`에 파일럿 앱(inventory-management: 엔티티 3, 로직 19, 스크린 11 → 교차 참조 56개) 검증 결과와 발견 버그 6건이 기록되어 있으며, 파이프라인이 수작업 아키텍처 문서의 오류(dead link 등)까지 역으로 찾아낸 사례가 있습니다.

---

## 6. 운영 지식: 버그 로그, 프로세스, 예제

### `bug-logs/`
- **`mxcli-bugs.md`** — mxcli/MDL 버그 카탈로그 BUG-01~19. 각 항목에 재현 단계·근본 원인·우회법이 있고 Critical(프로젝트 로드 불가)~Low(개발 마찰)로 분류됩니다. 대표 사례: BUG-01(도메인 변경 순서 위반 시 MPR 손상), BUG-15b(BSON 필드명 대소문자 오류 — 265개 파일/45,615건을 이진 치환으로 수정), BUG-18(dataview 내 CONTAINER BSON 손상). **CE 오류가 모델링 실수가 아니라 mxcli 특이 동작으로 보이면 항상 이 파일부터 확인**하는 것이 Baseline routing 규칙입니다.
- **`bug-log-apex-m0022.md`** — 실제 POC 프로젝트의 E2E 테스트 버그 기록(프로젝트별 로그의 예시 형식).

### `process/`
- **`process-learnings.md`** — M-0022 POC 회고. 성공 요인(MDL 반복성, Stub 아키텍처)과 실패 요인(페이지 커버리지의 이진 판정, 프로세스 게이트 불완전)을 분석하고, 12단계 빌드 루프 + 3단계 게이트(CE 체크 → 해피 패스 → 스크린샷 커버리지) 개선안을 제시합니다.
- **`test-plan-apex-m0022.md`** — 전제조건(P1~P7)·시나리오(H1~H2)·비즈니스 로직 검증(BL1~BL6)·스크립트 완료 추적을 한 문서에서 관리하는 테스트 계획의 참조 형식.

### `examples/outsystems-migration/`
- **`plan-overview.md`** — OS 모듈 112개를 Mendix 모듈 14개로 통합한 실전 아키텍처 계획: 도메인별 모듈 통합, 명명 규칙, 크로스모듈 계약, Stub 아키텍처(외부 통합을 `CONST_STUB_SAP=true` 같은 상수 게이팅으로 대체).
- **`build-loop-example.md`** — 단일 모듈(PayerRegistration)의 빌드 루프 실행 기록: 스크립트 13개(도메인→보안→스텁→마이크로플로우→페이지) + 3단계 게이트, NPE Dto 패턴·필터 커버리지 누락 포착 같은 실전 교훈 포함.

---

## 7. 전 세션에 적용되는 절대 규칙 두 가지

1. **Stale 빌드 금지** — `mxcli exec`는 `.mpr` 모델에 기록할 뿐이고, 브라우저가 서빙하는 것은 Studio Pro가 컴파일한 JS 번들입니다. 따라서 스크린샷·시각 리뷰·UI 테스트 전에 반드시: Studio Pro 완전 재시작(`pkill -9` 후 `open -a`) → **Run Locally** 완료 대기 → HTTP 200 확인. 이 규칙은 새 프로젝트의 `CLAUDE.md`에 복사해 넣어야 합니다.
2. **Baseline routing 명시 참조** — 다음 4가지는 상황 기반 발견에 맡기지 않고 모든 프로젝트 `CLAUDE.md`가 직접 참조해야 합니다: `learned-microflow-patterns.md`(마이크로플로우 작성 전반), `bug-logs/mxcli-bugs.md`(mxcli 특이 동작 진단), `agent-roles.md`(프로젝트 시작 시 서브에이전트 구성), `source-triage.md`(BRD 생성 전 추출 여부 판단).

---

## 8. 기여 규칙 (지식이 쌓이는 방식)

- **새 스킬**: `skills/{topic}.md`를 `# 제목`, `**Purpose:**`, `**Source:**` 헤더로 작성 → README의 "어떤 스킬을 언제 쓰는가" 표에 추가 → 모든 MDL 세션에 적용되는 범용 규율이면 Baseline routing에도 추가(이 표는 의도적으로 짧게 유지).
- **프로젝트 학습 승격**: 실제 프로젝트에서 검증된 패턴만 `skills/learned-{topic}.md`로 승격. 프로젝트의 빌드 계획·세션 노트 전체를 가져오는 것은 금지.
- **버그**: `bug-logs/mxcli-bugs.md`에 덧붙이거나 프로젝트별 로그를 새로 만듦.
- 커밋·푸시하면 다음 `git pull` 때 모든 소비 프로젝트에 전파됩니다.

---

## 9. 알려진 문서 정합성 참고 사항

전체 분석 중 발견된, 사용 시 알아두면 좋은 불일치입니다.

1. `skills/migration-pipeline.md`가 동반 스킬로 언급하는 `source-oracle-forms.md`와 `source-java-spring-angular.md`는 아직 `skills/`에 존재하지 않습니다(현존하는 source 계열은 `source-os11.md`와 `source-triage.md`뿐). `bootstrap-project.md`는 이를 "존재한다면"으로 조건부 표기하고 있습니다.
2. 단계 번호 체계가 문서마다 다릅니다 — README는 Stage 0(선별)~6(테스트), `migration-pipeline.md`는 Phase 1(분석)~7(MDL 생성). 내용은 대응되지만 번호로 소통할 때 기준 문서를 명시하는 것이 안전합니다.
