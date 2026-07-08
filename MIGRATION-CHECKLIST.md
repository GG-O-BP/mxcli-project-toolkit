# Non-SAP-source → Mendix 마이그레이션 체크리스트

> 대상: `sources/Non-SAP-source/` — KT N-BASE ERP 바코드 시스템 "아이템관리" 화면 발췌본
> (Spring MVC + iBatis 2 + JSP + WebSquare 5, © 2012 kt corp)
> 참고: `mxcli-project-toolkit/README.md`의 0~6단계 파이프라인 + `skills/migration-pipeline.md`

---

## 0. 배치 (완료)

- [x] `sources/Non-SAP-source/` — 원본 소스 그대로 이동 (건드리지 않음)
- [x] `analysis/Non-SAP-source/knowledge-base/share/` — Path B(문서) 산출물 폴더 생성
- [x] `analysis/Non-SAP-source/knowledge-base/brd/` — BRD 산출물 폴더 생성
- [x] `sources/`, `analysis/`는 저장소 `.gitignore`에 포함 — 커밋 위험 없음 확인

---

## 소스 특수성 (진행 전 인지할 것)

- [ ] 이 소스는 **완전한 앱이 아니라 발췌본** — `Controller.java`/`ServiceImpl.java`/`DAO.java`는 package/import가 잘려 있고, `com.kt.nbase.*` 내부 프레임워크는 저장소에 없음 (`sources/Non-SAP-source/PREREQUISITES.md` 참고)
- [ ] `sources/Non-SAP-source/reconstruction/`은 이미 `mvn compile`만 통과하는 스켈레톤 복원 시도 — 실제 구동 불가로 이미 문서화되어 있음, 재작업 불필요
- [ ] **기존 `pipelines/java-angular/` 추출기는 이 스택을 커버하지 않음** — `@Entity`/`@RestController`/Angular 컴포넌트 기반인데 이 소스는 iBatis 2 XML 매퍼 + 전통 Spring MVC + JSP/WebSquare → 0단계에서 반드시 수동 vs 파이프라인 판정 필요
- [ ] 규모가 작음(Java 6 + iBatis 매퍼 2 + JSP 4 + 화면정의 XML 1) → README 원칙상 "수동 분석 + 수기 BRD" 후보

---

## 0단계 — TRIAGE (선별)

**스킬:** `skills/source-triage.md` + `skills/assess-migration.md`

- [ ] 아래 프롬프트 실행

  ```
  skills/source-triage.md와 skills/assess-migration.md를 읽고 sources/Non-SAP-source/
  전체(server, sql, front, 데이터셋 zip)를 검토해줘. pipelines/java-angular 추출기가
  이 스택(iBatis2 + JSP + WebSquare, JPA/Angular 아님)을 커버하는지 판단하고,
  이 규모에서 파이프라인 구축이 정당한지 수동 분석이 나은지 결정해서
  analysis/Non-SAP-source/architecture.md에 커버리지 매트릭스 + go/no-go 결정 +
  확정 범위(아이템관리 화면)를 정리해줘.
  ```

- [ ] 산출물 확인: `analysis/Non-SAP-source/architecture.md`에 커버리지 매트릭스·go/no-go·확정 범위가 명시되어 있는가
- [ ] **게이트: 이 판정이 나기 전에는 2단계(BRD 생성)로 넘어가지 않는다**

---

## 1단계 — ANALYSIS (분석)

### Path A — 코드 → 구조

**스킬:** `skills/assess-migration.md` (0단계에서 이미 로드)

- [ ] 아래 프롬프트 실행

  ```
  analysis/Non-SAP-source/architecture.md의 확정 범위에 따라
  sources/Non-SAP-source/server/*.java, sql/*.xml, front/itemInfo.xml을 분석해서
  엔티티 후보(BS_ITEMINFO 등), CRUD 로직, 화면 구조(그리드 컬럼/버튼/팝업)를
  같은 architecture.md에 구조화된 섹션으로 추가해줘.
  ```

- [ ] 산출물 확인: `architecture.md`에 엔티티 후보 / 로직 목록 / 화면 구조 섹션 추가됨

### Path B — 문서/데이터 → KB

**스킬:** `skills/kb-generation.md`

- [ ] 아래 프롬프트 실행

  ```
  skills/kb-generation.md 템플릿에 따라
  "sources/Non-SAP-source/BASE OAOE 아이템관리 DATASET-SAPMPLE.zip" 안의
  itemInfo.xlsx(597건, 14개 필드)와 캡쳐 스크린샷을 분석해서
  analysis/Non-SAP-source/knowledge-base/share/KB_ItemManagement_DataSample.md를
  작성해줘. 필드 정의, 대표 샘플, 화면 캡쳐에서 보이는 UI 구성요소를 포함해.
  ```

- [ ] 산출물 확인: `analysis/Non-SAP-source/knowledge-base/share/KB_ItemManagement_DataSample.md` 생성됨

---

## 2단계 — REQUIREMENTS (요구사항 / BRD)

**스킬:** `skills/brd-generation.md` → `skills/brd-validation.md`

- [ ] BRD 작성 프롬프트 실행

  ```
  skills/brd-generation.md 프롬프트 템플릿에 따라 analysis/Non-SAP-source/architecture.md와
  knowledge-base/share/KB_ItemManagement_DataSample.md를 합쳐서
  F001-item-management.brd.json을 analysis/Non-SAP-source/knowledge-base/brd/ 밑에
  작성해줘. Oracle 전용 SQL 구문(DECODE, CONNECT BY, MERGE)과 KT 내부 프레임워크가
  하던 암복호화/엑셀생성 등은 businessRules 또는 openQuestions로 명시해줘.
  ```

- [ ] 검증 프롬프트 실행

  ```
  skills/brd-validation.md 체크리스트로 F001-item-management.brd.json을 검증해줘.
  중복/충돌/고아 개념/깨진 관계를 찾아서 고치고, clean 상태가 될 때까지 반복해줘.
  ```

- [ ] 산출물 확인: `analysis/Non-SAP-source/knowledge-base/brd/F001-item-management.brd.json`이 validation-clean 상태

---

## 3단계 — ARCHITECTURE & DESIGN (병렬 진행)

### 3a — 모듈 경계

**스킬:** `skills/modularize-domain.md`

- [ ] 프롬프트 실행

  ```
  skills/modularize-domain.md 기준에 따라 F001-item-management.brd.json이 별도
  Mendix 모듈이어야 하는지, 기존 앱의 한 모듈로 흡수돼야 하는지 판단하고
  근거 HTML 문서를 만들어줘. 소스 파일 구조를 그대로 베끼지 말고 결정해줘.
  ```

- [ ] 산출물 확인: 모듈 경계 결정 + 근거 HTML, 사용자 승인 완료

### 3b — 아키텍처 청사진 (3a 완료 후 착수)

**스킬:** `skills/architecture-blueprint.md`

- [ ] 프롬프트 실행

  ```
  skills/architecture-blueprint.md에 따라 모듈 정의 문서, 구조 다이어그램,
  fit-gap 분석을 작성해줘. WebSquare 상용 라이선스 의존성과 KT 내부 프레임워크
  미제공 부분을 fit-gap 항목으로 명시해줘.
  ```

- [ ] 산출물 확인: 모듈 정의 + 다이어그램 + fit-gap(오픈 이슈 포함) 문서

### 3b — 디자인 산출물 (3a 완료 후, 3b 아키텍처와 병행 가능)

**스킬:** `skills/design-artifacts.md`

- [ ] 프롬프트 실행

  ```
  skills/design-artifacts.md에 따라
  "sources/Non-SAP-source/캡쳐_BASE OAOE_위치아이템관리_아이템관리.jpeg"를
  참고 화면으로 삼아 Mendix Atlas 기반 와이어프레임(그리드+검색조건+등록/수정 팝업)을
  작성해줘.
  ```

- [ ] 산출물 확인: 버전 관리된 디자인 시스템 + 화면별 와이어프레임

---

## 4단계 — BUILD PLAN (빌드 계획)

**스킬:** `skills/brd-to-build-plan.md`

- [ ] 프롬프트 실행

  ```
  skills/brd-to-build-plan.md에 따라 F001-item-management.brd.json + 3단계
  아키텍처 산출물을 바탕으로 번호 매겨진 의존성 순서 빌드 계획
  (엔티티→연관관계→마이크로플로우→페이지)을 작성해줘.
  ```

- [ ] 산출물 확인: 의존성 순서로 번호 매겨진 스크립트 계획 문서

---

## 5단계 — BUILD (빌드)

> ⚠️ 이 단계는 실제 Mendix `.mpr` 프로젝트가 열려 있어야 시작 가능 — 이 툴킷 저장소에는 대상 앱이 없으므로, mxcli로 여는 별도 Mendix 프로젝트 폴더에서 진행한다.

**스킬:** `skills/iterative-build-loop.md` + `skills/mdl-cookbook-microflows.md` + `bug-logs/mxcli-bugs.md`

- [ ] 대상 Mendix 프로젝트(.mpr) 준비 및 Studio Pro 실행 확인
- [ ] 프롬프트 실행

  ```
  skills/iterative-build-loop.md의 12단계 게이트에 따라 빌드 계획의 1번 스크립트부터
  mxcli로 실행하고 검증해줘. MDL 작성 시 skills/learned-microflow-patterns.md와
  skills/learned-page-patterns.md 규칙을 따라줘.
  ```

- [ ] 계획의 각 스크립트를 모듈/화면 단위로 반복하며 게이트 통과 확인
- [ ] CE 오류 발생 시 `bug-logs/mxcli-bugs.md` 대조 후 알려진 이슈인지 확인

---

## 6단계 — TEST (테스트)

**스킬:** `skills/e2e-harness-base.md` + `skills/learned-db-assertions.md`

- [ ] 프롬프트 실행

  ```
  skills/e2e-harness-base.md에 따라 아이템관리 그리드 조회/등록/수정/삭제
  Playwright 테스트를 작성하고, itemInfo.xlsx의 597건 데이터를 시드로 써줘.
  DB 검증은 skills/learned-db-assertions.md대로 PostgreSQL 직접 접속으로 해줘.
  ```

- [ ] 골든 패스(정상 조회/등록/수정/삭제) 통과 확인
- [ ] 엣지 케이스(빈 값, 중복 키, 페이징 경계) 통과 확인
- [ ] DB 어설션(PostgreSQL 직접 쿼리) 통과 확인

---

## 진행 중 계속 열어둘 참고 문서

- [ ] `sources/Non-SAP-source/PREREQUISITES.md` — 종속성/버전 근거
- [ ] `sources/Non-SAP-source/reconstruction/README.md` — 이미 시도된 스켈레톤 복원과 그 한계
- [ ] `process/process-learnings.md` — 과거 유사 프로젝트의 프로세스 결정 참고
