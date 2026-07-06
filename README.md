# mxcli-project-toolkit

**Mendix 마이그레이션 및 개발 프로젝트**를 위한 공유 스킬, 프롬프트 템플릿, 학습 자료 모음.

OS 마이그레이션, Java/Angular 마이그레이션, 기타 고객 통합 작업 등 모든 mxcli 기반 프로젝트에서 사용됩니다.

---

## ⚠️ 핵심 규칙: 오래된(stale) 빌드는 절대 스크린샷하거나 감사하지 말 것

`mxcli exec`는 `.mpr` 모델 파일에 기록하지만, **브라우저가 서빙하는 것은 Studio Pro가 컴파일한 JS 번들이지 — 원본 모델이 아닙니다**. `mxcli exec`를 실행한 뒤에도 SP가 재컴파일하기 전까지 브라우저는 여전히 *이전* 빌드를 보여줍니다. SP 재컴파일 전에 찍은 스크린샷은 UX 감사와 테스트 검증에 아무 가치가 없습니다.

**스크린샷, 시각적 리뷰, UI 테스트 전에 반드시 지켜야 할 프로토콜:**

1. 평소처럼 `mxcli exec` 실행
2. Studio Pro 완전 재시작: `pkill -9 -f "Contents/MacOS/studiopro" && rm -f *.mpr.lock && open -a "Mendix Studio Pro X.Y.Z" YourProject.mpr`
   - (옵션 없이) `open file.mpr`만 실행하면 이미 실행 중인 SP를 **앞으로 가져올 뿐**이며 macOS의 버전 선택 팝업을 띄울 수 있습니다 — 모델을 다시 로드하지 않습니다. 항상 전체 앱 이름과 함께 `open -a "..."`를 사용하고, 항상 `pkill -9`를 먼저 실행하세요.
3. SP에서 **Run Locally**를 클릭하고 컴파일이 끝날 때까지 대기
4. 앱이 살아있는지 확인: `curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT/login.html` → `200`
5. **그런 다음에야** 스크린샷을 찍거나 UI 검증을 실행

**새 프로젝트를 설정할 때 이 규칙을 그 프로젝트의 CLAUDE.md에 추가하세요** — 모든 에이전트 세션이 이 규칙에 구속되도록. 기존 프로젝트 CLAUDE.md의 "Screenshot & UX audit rule" 섹션을 템플릿으로 복사하면 됩니다.

---

## 마이그레이션이 이 툴킷을 거쳐 가는 흐름

모든 마이그레이션은 소스 스택과 무관하게 동일한 단계를 거칩니다. 각 단계마다 그 단계를 담당하는 스킬이 하나씩 있고, 각 스킬은 구체적인 산출물을 다음 단계로 넘깁니다:

```
0. TRIAGE (선별)            소스 스택 → 커버리지 결정 + 한정된 범위, 승인 완료
   (source-triage.md, assess-migration.md의 인벤토리와 대조 확인)
        │
        ▼
1. ANALYSIS (분석)          소스 코드/문서 → 추출된 JSON + KB 마크다운
   (migration-pipeline.md, source-*.md, kb-generation.md)
        │
        ▼
2. REQUIREMENTS (요구사항)   KB + 추출된 JSON → 검증된 BRD JSON (모듈별)
   (brd-generation.md, brd-validation.md)
        │
        ▼
3. ARCHITECTURE & DESIGN (아키텍처·설계)   BRD → Mendix 모듈 경계, 다이어그램, fit-gap, 디자인 시스템
   (modularize-domain.md → architecture-blueprint.md + design-artifacts.md, 병렬 수행)
        │
        ▼
4. BUILD PLAN (빌드 계획)    BRD + 아키텍처 → 의존성 순서로 번호 매겨진 스크립트 계획
   (brd-to-build-plan.md)
        │
        ▼
5. BUILD (빌드)             계획 → 동작하는 Mendix 앱, 한 번에 한 모듈씩, 게이트 검증을 거침
   (iterative-build-loop.md, mdl-cookbook-microflows.md, bug-logs/mxcli-bugs.md)
        │
        ▼
6. TEST (테스트)            동작하는 앱 → 검증된 동작 (Playwright + DB 검증)
   (e2e-harness-base.md)
```

**0단계(선별)는 형식적 절차가 아니라 게이트입니다.** 이 앱이 추출 파이프라인을 돌릴 만큼 큰지부터 판단하고(작은 앱은 수동 `assess-migration.md` + 수기 BRD로 바로 건너뜀), 기존 추출기/매퍼가 이 소스 스택을 커버하는지 아니면 새로 만들어야 하는지 확인하며, 대규모 소스라면 전체를 한 번에 처리하는 대신 한정된 범위의 부분집합을 권고합니다. 또한 앱이 여러 개의 Mendix 앱으로 나눠야 할 만큼 큰지에 대한 질문도 (결정하지는 않고) 표시해 두는데, 이 질문은 3단계의 모듈 경계 작업 전에 반드시 해결되어야 합니다. 2단계(BRD 생성)는 이 단계가 승인되기 전에는 시작하지 않습니다.

### `assess-migration`과 추출 파이프라인이 서로를 보완하는 방식

이 둘은 같은 단계를 위한 두 가지 도구입니다 — 서로를 대체하는 것이 아니라 함께 사용합니다:

| 도구 | 하는 일 | 사용 시점 |
|------|-------------|----------------|
| `assess-migration.md` | AI 주도 수동 인벤토리: 소스 파일을 읽고 엔티티, 비즈니스 로직, 연동, 보안, 마이그레이션 리스크를 다루는 사람이 읽기 좋은 마크다운 보고서를 생성합니다. | 항상 — 작은 앱은 이것만으로 충분하고, 큰 앱에서는 파이프라인 출력 위에 사람이 읽을 수 있는 레이어를 제공합니다. 추출 파이프라인 전이나 후에 실행하세요. |
| 추출 파이프라인 (`pipelines/java-angular/` · `pipelines/outsystems/`) | AST 기반 자동 추출: 소스 코드를 정규화된 KB JSON으로 파싱하고, BRD 매퍼를 실행하며, 모듈별 BRD와 HTML 보고서를 생성합니다. | 수동으로 읽으면 클래스를 놓칠 수 있는 중대형 앱, 또는 BRD 생성을 위해 기계가 처리할 수 있는 출력이 필요한 경우. |

**중대형 Java/Spring 앱의 올바른 결합 흐름:**

```
assess-migration.md          ←  AI가 소스를 읽고 마크다운 선별 보고서 생성
        +
java-extractor.js (Phase 2)  ←  AST 파서가 모든 엔티티/로직/엔드포인트 추출 → KB JSON
        +
BRD 매퍼 (Phase 3)           ←  KB JSON → 모듈별 구조화된 BRD
        ↓
source-triage.md             ←  사람이 두 출력을 모두 검토하고 범위 + 접근 방식 승인
        ↓
1–6단계 진행
```

`assess-migration.md`의 출력은 `source-triage.md`의 커버리지 매트릭스(Step 3)에 입력됩니다 — 소스에 *무엇이* 있는지 알려주는 것입니다. 추출 파이프라인은 같은 내용을 기계가 읽을 수 있는 형태로 알려줍니다. 이 둘은 서로를 교차 검증합니다: 둘 사이의 불일치(예: AI는 찾았는데 추출기가 놓친 규칙, 또는 추출기는 엔티티 40개를 찾았는데 AI는 15개만 샘플링한 경우)가 바로 `source-triage.md`가 Phase 2 BRD 생성 전에 드러내도록 설계된 간극입니다.

**1단계(분석)**는 순서에 상관없이 진행할 수 있는 두 개의 독립적인 경로로 이루어집니다: 경로 A는 소스 코드에서 곧바로 구조를 추출하고(XML/Java/C#/SQL → JSON), 경로 B는 비즈니스 문서에서 구조를 추출합니다(Excel/Word/PDF/PPTX → KB 마크다운). 두 경로 모두 동일한 병합 단계로 합류합니다.

**3a/3b 단계는 순차가 아니라 병렬로 진행됩니다**: 먼저 `modularize-domain.md`가 모듈 경계를 결정하고(소스 파일을 Mendix 모듈에 1:1로 매핑하지 말 것), 그다음 `architecture-blueprint.md`(구조 다이어그램)와 `design-artifacts.md`(UI/브랜드 레이어)가 그 결정을 동시에 이어받아 사용합니다.

**0–4단계에서는 mxcli를 전혀 건드리지 않습니다.** MDL 스크립팅은 이미 검토를 마친 계획을 바탕으로 5단계에서야 시작됩니다. 이것은 의도된 설계입니다 — 잘못된 모듈 경계는 40개의 MDL 스크립트가 그것을 전제하고 만들어진 뒤에 고치는 것보다, 다이어그램 단계에서(잘못된 범위 결정이라면 추출이 실행되기 전에) 고치는 편이 훨씬 저렴하기 때문입니다.

실제 프로젝트에서 여섯 개 빌드 단계 전체를 수행한 예시는 `examples/outsystems-migration/`을 참고하세요(이 예시는 선별 단계가 도입되기 전에 작성되었습니다).

---

## 저장소 구성

```
mxcli-project-toolkit/
  skills/
    migration-pipeline.md       ← 전체 파이프라인 단계 가이드 (XML → KB → BRD → MDL)
    source-triage.md            ← 추출 전 게이트: 커버리지 확인, 수동 vs 파이프라인 판단, 범위 한정
    modularize-domain.md        ← Mendix 모듈 경계 결정 (Phase 6): 기준, 승인, HTML 근거 문서
    architecture-blueprint.md   ← 목표 아키텍처 청사진: 다이어그램, 모듈 정의, 연결 구조, fit-gap, 미해결 이슈
    design-artifacts.md         ← UI/브랜드 레이어: 버전 관리되는 디자인 시스템 + 주석 달린 와이어프레임
    brd-to-build-plan.md        ← 계획 정의: BRD + 아키텍처 → 의존성 순서로 번호 매겨진 빌드 계획
    iterative-build-loop.md     ← 모듈별 빌드 규율: 12단계 게이트, CE 오류 분류, Studio Pro 인계
    brd-generation.md           ← BRD JSON 프롬프트 템플릿 + 검증 체크리스트
    kb-generation.md            ← 문서 추출 (Excel/Word/PDF → KB 마크다운)
    source-os11.md              ← OutSystems 11 XML 스키마 레퍼런스
    os-xml-schema.md            ← OS eSpace XML 구조 상세
    mdl-cookbook-microflows.md  ← 마이크로플로우용 MDL 스크립팅 패턴
    qa-loop-goal-pattern.md     ← /goal 기반 반복 파이프라인 검증 기법
    e2e-harness-base.md         ← 엔드투엔드 테스트 하니스 기반
    assess-migration.md         ← 사전 마이그레이션 평가
    migrate-general.md          ← 소스에 무관한 범용 마이그레이션 가이드
    migrate-outsystems.md       ← OutSystems 전용 마이그레이션 가이드
    bootstrap-project.md        ← 새 프로젝트의 CLAUDE.md 생성: Baseline routing + 프로젝트 고유 사실
    agent-roles.md              ← 도구 권한을 한정한 프로젝트별 mdl/gate/test 서브에이전트 생성
    learned-*.md                ← 실제 프로젝트에서 검증된 학습 내용
  pipelines/                    ← 소스별 추출 도구 (코드; node_modules는 gitignore 처리)
    outsystems/                 ← OS XML → KB → BRD (히스토리와 함께 이관) + sample-outputs
    java-angular/               ← Java + Angular/Spring Boot → KB → BRD
  examples/
    outsystems-migration/
      plan-overview.md          ← 실전 예시: OS 모듈 112개 → Mendix 모듈 14개, 아키텍처 결정 과정
      build-loop-example.md     ← 실전 예시: 단일 모듈(PayerRegistration) 단계별 진행
  bug-logs/
    mxcli-bugs.md               ← 알려진 mxcli CLI 버그와 우회 방법
    bug-log-apex-m0022.md    ← 프로젝트별 버그 로그 (Apex M-0022)
  process/
    process-learnings.md        ← 프로젝트 전반의 프로세스 개선 사항
    test-plan-apex-m0022.md  ← 참조용 테스트 계획
```

---

## 어떤 스킬을 언제 쓰는가

| 작업 | 로드할 스킬 |
|------|--------------|
| 추출 여부 자체의 판단, 커버리지 확인, 대규모 소스의 범위 한정 | `source-triage.md` |
| 추출 파이프라인 실행 | `migration-pipeline.md` |
| 목표 아키텍처 다이어그램 작성: 모듈 정의, 연결 구조, fit-gap | `architecture-blueprint.md` |
| 페이지 빌드 전에 브랜드 + 와이어프레임 설계 | `design-artifacts.md` |
| BRD + 아키텍처를 순서가 정해진 빌드 계획으로 변환 | `brd-to-build-plan.md` |
| mxcli로 모듈 빌드 (검증 기반 반복 방식) | `iterative-build-loop.md` |
| BRD JSON 작성 또는 보강 | `brd-generation.md` |
| Excel/Word/PDF 사양서 추출 | `kb-generation.md` |
| OS XML 소스 이해 | `source-os11.md` + `os-xml-schema.md` |
| MDL 마이크로플로우 스크립트 작성 | `mdl-cookbook-microflows.md` |
| mxcli 오류 진단 | `bug-logs/mxcli-bugs.md` |
| 새 스택 파이프라인의 추출 품질 검증 | `qa-loop-goal-pattern.md` |
| `create module` 전에 모듈 경계 결정 | `modularize-domain.md` |
| 마이그레이션 사전 평가/계획 수립 | `assess-migration.md` |
| OutSystems 앱 마이그레이션 | `migrate-outsystems.md` |
| OS 또는 Java/Angular 추출 파이프라인 실행 | `pipelines/outsystems/` · `pipelines/java-angular/` |
| 실제 프로젝트에서 전체 흐름이 어떻게 맞물리는지 확인 | `examples/outsystems-migration/` |
| 새 프로젝트의 CLAUDE.md 생성 (Baseline routing + 프로젝트 고유 사실) | `bootstrap-project.md` |
| 새 프로젝트에 개발 프로세스 서브에이전트 구성 (draft/gate/test 분리) | `agent-roles.md` |

---

## 새 스킬 추가 방법

1. `skills/`에 다음 헤더를 가진 새 `.md` 파일을 만듭니다:
   ```markdown
   # 스킬 이름 — 목적
   **Purpose:** 한 줄 설명
   **Source:** 어느 프로젝트 또는 세션에서 나온 것인지
   ```
2. 해당되는 경우 프롬프트 템플릿을 포함한 단계별 가이드로 구성합니다
3. 위의 "어떤 스킬을 언제 쓰는가" 표에 추가합니다
4. **작업 종류와 무관하게 모든 MDL 작성 세션에 적용되는 스킬이라면**(상황 의존적이지 않은 경우 — 예: 특정 단계 전용 절차가 아니라 새로 발견된 범용 MDL 함정) 위의 "Baseline routing"에도 추가합니다. 상황 의존적인 스킬은 그 표에 넣지 않습니다. 그 표는 의도적으로 짧게 유지합니다.
5. 커밋하고 푸시합니다 — 다음 `git pull` 때 모든 프로젝트에서 사용할 수 있습니다

---

## 프로젝트별 학습 내용 추가 방법

실제 프로젝트에서 검증된 패턴은 `skills/learned-{topic}.md` 파일로 추가하세요. 이 파일들은 관련 작업이 있을 때 Claude가 로드하며, 프로젝트 전반의 지식으로 축적됩니다. 패턴이 "Baseline routing"에 들어갈 만큼 범용적이라면(`learned-microflow-patterns.md` 류의 규율은 대부분 그렇습니다) 거기에도 추가하세요 — 순전히 상황 의존적인 항목으로만 남겨두지 마세요.

버그는 `bug-logs/mxcli-bugs.md`에 덧붙이거나 프로젝트별 로그를 새로 만드세요.

---

## 이 툴킷 사용하기

**참조 모델(기본):** 한 번만 클론하고 각 프로젝트가 그 위치를 가리키게 합니다 — 복사본 없음, 버전 어긋남 없음.
```
git clone https://github.com/MendixMau/mxcli-project-toolkit.git ~/Mendix/mxcli-project-toolkit
```
각 프로젝트의 CLAUDE.md가 `~/Mendix/mxcli-project-toolkit`을 참조합니다. 업데이트는 `git pull`로 받습니다.
자체 완결형 인계가 필요하면 대신 git submodule로 추가하세요. 파이프라인별로 `pipelines/<x>/pipeline` 안에서 `npm install`을 실행하세요(node_modules는 gitignore 처리됨).

### Baseline routing — 모든 새 프로젝트의 CLAUDE.md에 복사해 넣을 것

위의 "어떤 스킬을 언제 쓰는가" 표는 *상황 의존적*입니다 — 특정 작업이 필요로 할 때 스킬을 로드합니다. 하지만 몇몇 스킬은 작업과 무관하게 **모든** MDL 작성 세션에 적용되며, 상황 기반 발견 방식으로는 조용히 놓치게 됩니다. 작업 중에 그것들을 로드하라고 일러주는 계기가 없기 때문입니다. 이 툴킷을 사용하는 모든 프로젝트의 `CLAUDE.md`(또는 MDL 작성 전에 읽을 것을 에이전트에게 지시하는 문서, 예: 자체 `write-microflows.md`)는 우연히 마주치기를 기대하지 말고 아래 항목을 직접 참조해야 합니다:

| 항상 해당되는 상황 | 참조할 파일 |
|---|---|
| 마이크로플로우 작성 또는 수정 전반 | `skills/learned-microflow-patterns.md` — MDL 함정 + 주석(annotation) 규율 (전면 적용이 아니라 선별 적용; CE 오류 수정에는 항상 주석) |
| 모델링 실수가 아니라 알려진 mxcli 특이 동작으로 보이는 CE 오류나 동작 | `bug-logs/mxcli-bugs.md` |
| 새 프로젝트의 개발 프로세스 서브에이전트 구성 | `skills/agent-roles.md` — 프로젝트 시작 시 한 번, "필요할 때"가 아님 |
| BRD가 생성되기 전, 추출 여부 자체의 판단 | `skills/source-triage.md` |

**이것이 암묵적이 아니라 명시적이어야 하는 이유:** 프로젝트 자체의 스킬 파일은 대개 해당 툴킷 학습이 존재하기 전에, 또는 나중에 새 학습이 추가되기 전에 작성됩니다 — 그 파일들이 저절로 새 학습에 대한 상호 참조를 갖게 되는 일은 없습니다. 이 툴킷을 `git pull`해서 새로운 baseline급 스킬(대개 새 `learned-*.md`)이 들어오면, 이 툴킷을 사용하는 모든 프로젝트의 라우팅을 그에 맞게 업데이트하세요 — 다음 세션이 우연히 발견하리라 기대하지 마세요.

**클론 후에는 로컬 소스 경로를 설정하세요** — `pipelines/<x>/pipeline/config.json`에서. 커밋된 파일은 `<placeholder>` 값으로 배포되므로, 본인의 소스 워크스페이스를 가리키게 수정하세요. 실제 로컬 경로는 절대 커밋하지 마세요.

**프로젝트 산출물은 여기 두지 않습니다** (`analysis/`, `sources/`, `knowledge-base/`, `*.mpr`는 gitignore 처리) — 각 마이그레이션은 이 저장소를 참조하는 자체 워크스페이스에서 실행됩니다.

**빌드 계획과 세션 노트는 각자의 프로젝트에 두고, 여기 두지 않습니다.** 이 저장소는 재사용 가능한 도구 + 스킬 + 소규모 엄선 예시만 담습니다. 프로젝트의 아키텍처 청사진, 번호 매겨진 빌드 계획, 미해결 이슈 목록, 진행 중인 세션 일지는 그 프로젝트 자체의 저장소에 속하며(예: 프로젝트 루트의 `architecture/build-plan.md`, `SESSION-NOTES.md`) — 절대 툴킷으로 커밋해 되돌려 보내지 마세요. 그 계획에서 나온 패턴이 프로젝트 전반에서 재사용 가능하다고 판명되면, 계획 전체를 남겨두는 대신 여기의 `skills/learned-*.md` 파일로 승격하세요.

## 사용처

- `pipelines/outsystems/` — OutSystems 11 → Mendix 파이프라인 (구 독립 저장소 `os-migration-pipeline`)
- `pipelines/java-angular/` — Java + Angular/Spring Boot → Mendix 파이프라인
- 기타 여러 고객 통합 및 마이그레이션 프로젝트
