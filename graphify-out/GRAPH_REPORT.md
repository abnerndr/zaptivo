# Graph Report - zaptivo  (2026-11-05)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2278 nodes · 6703 edges · 139 communities (97 shown, 42 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ad0c06e9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 106
- Community 107
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 138

## God Nodes (most connected - your core abstractions)
1. `cn()` - 172 edges
2. `apiFetch()` - 129 edges
3. `next` - 122 edges
4. `requireSessionAccount()` - 121 edges
5. `prisma` - 100 edges
6. `Button()` - 95 edges
7. `react` - 95 edges
8. `vitest` - 80 edges
9. `lucide-react` - 77 edges
10. `toErrorResponse()` - 70 edges

## Surprising Connections (you probably didn't know these)
- `handleCreate()` --calls--> `apiFetch()`  [EXTRACTED]
  src/components/settings/invite-member-dialog.tsx → src/lib/api/client.ts
- `DELETE()` --calls--> `requireSessionAccount()`  [EXTRACTED]
  src/app/api/automations/[id]/route.ts → src/domain/auth/context.ts
- `GET()` --calls--> `requireSessionAccount()`  [EXTRACTED]
  src/app/api/automations/templates/route.ts → src/domain/auth/context.ts
- `DELETE()` --calls--> `requireSessionAccount()`  [EXTRACTED]
  src/app/api/broadcasts/[id]/route.ts → src/domain/auth/context.ts
- `DELETE()` --calls--> `requireSessionAccount()`  [EXTRACTED]
  src/app/api/contact-types/[id]/route.ts → src/domain/auth/context.ts

## Import Cycles
- None detected.

## Communities (139 total, 42 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (92): Named, preferLockedName(), trimmed(), ensureContactAvatar(), brPhonePrefixes(), contactDisplayName(), digitsOnly(), formatWhatsAppPhone() (+84 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (61): @base-ui/react, PipelineRow, PipelinesPage(), slugify(), CHAT_MEDIA_BUCKET, ComposerMediaKind, formatDuration(), MEDIA_CAPTION_MAX (+53 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (57): Ctx, DELETE(), GET(), POST(), Ctx, DELETE(), GET(), GET() (+49 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (43): AI_PROVIDER_DEFAULT_MODEL, aiRequestTimeoutMs(), buildSystemPrompt(), HANDOFF_SENTINEL, MAX_OUTPUT_TOKENS, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EmbeddingResponse (+35 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (50): GET(), POST(), requireConfig(), POST(), advanceFlow(), appendEvent(), dispatchInboundToFlows(), evaluateConditionPredicate() (+42 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (47): SettingsPage(), SettingsPageInner(), inter, metadata, RootLayout(), viewport, ModeToggle(), AuthSessionProvider() (+39 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (28): abort(), abortOnCannotGrowMemory(), addOnInit(), addOnPostRun(), addOnPreRun(), addRunDependency(), assert(), callRuntimeCallbacks() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (41): react, formatListTime(), formatMessageTime(), InboxPage(), saveContact(), NotificationRow, NotificationsPage(), markAllRead() (+33 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (36): SettingsPanel(), RequireRole(), PresenceDot(), ApiKey, ApiKeysSettings(), handleRevoke(), fmtDate(), keyStatus() (+28 more)

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (32): next-intl, ForgotPasswordPage(), LoginPage(), LoginPageInner(), SignupPage(), SignupPageInner(), JoinPage(), Peek (+24 more)

### Community 10 - "Community 10"
Cohesion: 0.15
Nodes (35): lucide-react, sonner, AutomationLogsPage(), LogRow, AutomationsPage(), ContactRow, ContactType, DispatchRow (+27 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (39): deleteMessageTemplate(), DeleteMessageTemplateArgs, DownloadMediaArgs, editMessageTemplate(), EditMessageTemplateArgs, EditMessageTemplateResult, getMediaUrl(), GetMediaUrlArgs (+31 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (37): AiUsageCard(), Stat(), UsageResponse, WINDOWS, NextNodeRow(), NodeKeySelect(), TextRow(), ConditionCfg (+29 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (27): GET(), POST(), GET(), POST(), Ctx, DELETE(), PATCH(), GET() (+19 more)

### Community 14 - "Community 14"
Cohesion: 0.05
Nodes (37): Account, AssignConversationStepConfig, Automation, AutomationLog, AutomationLogStatus, AutomationLogStepResult, AutomationStep, Broadcast (+29 more)

### Community 15 - "Community 15"
Cohesion: 0.06
Nodes (32): description, engines, node, license, name, packageManager, prisma, seed (+24 more)

### Community 16 - "Community 16"
Cohesion: 0.06
Nodes (32): dependencies, @auth/prisma-adapter, @aws-sdk/client-s3, axios, @base-ui/react, bcryptjs, class-variance-authority, clsx (+24 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (23): @dnd-kit/core, DealCard(), DealCardProps, formatDate(), initials(), computeStageProbability(), Metric(), PipelineAnalytics() (+15 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (18): @tanstack/react-query, QueryProvider(), applyConversationPreview(), applyMediaUrl(), applyMessageInsert(), applyMessageMove(), event, toBubble() (+10 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (26): DELETE(), GET(), PATCH(), POST(), DELETE(), GET(), PATCH(), POST() (+18 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (27): applyEdgeConnection(), CanvasEdge, deriveCanvasEdges(), OutgoingSlot, outgoingSlots(), patchedConfigWithoutKey(), unlinkNodeReferences(), FAQ_BOT (+19 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (27): recharts, BarChart, BarChartEventProps, BarChartProps, BaseEventProps, ChartLegend(), ChartTooltip(), ChartTooltipProps (+19 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (12): GET(), dedupeKey(), GET(), Ctx, GET(), GET(), GET(), POST() (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (26): DashboardShell(), DashboardShellInner(), ContactAvatar(), contactInitial(), DashboardLayout(), metadata, getPageTitleKey(), Header() (+18 more)

### Community 24 - "Community 24"
Cohesion: 0.10
Nodes (25): class-variance-authority, Accordion(), AccordionContent(), AccordionItem(), AccordionTrigger(), Alert(), AlertAction(), AlertDescription() (+17 more)

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (21): Ctx, DELETE(), PATCH(), toErrorResponse(), GET(), POST(), toErrorResponse(), Ctx (+13 more)

### Community 26 - "Community 26"
Cohesion: 0.09
Nodes (12): nextConfig, SECURITY_HEADERS, withNextIntl, next, GET(), POST(), serialize(), toErrorResponse() (+4 more)

### Community 27 - "Community 27"
Cohesion: 0.17
Nodes (21): DashboardData, DashboardPage(), deltaLabel(), RangeDays, ActivityFeed(), EmptyState(), arcPath(), Donut() (+13 more)

### Community 28 - "Community 28"
Cohesion: 0.19
Nodes (17): main(), requireEnv(), bcryptjs, @prisma/adapter-pg, POST(), Ctx, POST(), PATCH() (+9 more)

### Community 29 - "Community 29"
Cohesion: 0.20
Nodes (20): Ctx, DELETE(), PATCH(), GET(), removeAccountMember(), ACCOUNT_ROLES, canDeleteAccount(), canEditSettings() (+12 more)

### Community 30 - "Community 30"
Cohesion: 0.13
Nodes (21): Ctx, DELETE(), PATCH(), GET(), POST(), RequireRoleProps, Member, getOrgRolePermissions() (+13 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (16): pg, Ctx, POST(), GET(), PATCH(), serialize(), GET(), POST() (+8 more)

### Community 32 - "Community 32"
Cohesion: 0.15
Nodes (17): date-fns, MessageActionsProps, MediaImage(), MediaUnavailable(), MessageBubble(), MessageBubbleProps, MessageContent(), groupReactions() (+9 more)

### Community 33 - "Community 33"
Cohesion: 0.14
Nodes (17): authorize(), GET(), Ctx, POST(), Ctx, DELETE(), GET(), PUT() (+9 more)

### Community 34 - "Community 34"
Cohesion: 0.15
Nodes (14): API_KEY_PREFIX, generateApiKey(), GeneratedApiKey, hashApiKey(), looksLikeApiKey(), timingSafeHexEqual(), ApiKeyRow, findActiveKeyByHash() (+6 more)

### Community 35 - "Community 35"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (16): @aws-sdk/client-s3, ALLOWED_KINDS, DELETE(), POST(), outgoingMediaKind(), OutgoingMessageType, deleteObject(), publicUrl() (+8 more)

### Community 37 - "Community 37"
Cohesion: 0.15
Nodes (16): @prisma/client, Ctx, POST(), Ctx, GET(), Ctx, DELETE(), GET() (+8 more)

### Community 38 - "Community 38"
Cohesion: 0.15
Nodes (16): EditAutomationPage(), Step, STEP_LABELS, NewAutomationPage(), Template, NewBroadcastPage(), Tag, Template (+8 more)

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (16): @sendgrid/mail, POST(), GET(), clampExpiryDays(), DEFAULT_INVITE_EXPIRY_DAYS, GeneratedToken, generateInviteToken(), hashInviteToken() (+8 more)

### Community 40 - "Community 40"
Cohesion: 0.16
Nodes (14): GET(), PATCH(), DELETE(), Ctx, DELETE(), PATCH(), toErrorResponse(), auth (+6 more)

### Community 41 - "Community 41"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 42 - "Community 42"
Cohesion: 0.14
Nodes (12): @auth/prisma-adapter, next-auth, authConfig, handlers, signIn, signOut, config, JWT (+4 more)

### Community 43 - "Community 43"
Cohesion: 0.12
Nodes (17): scripts, build, db:generate, db:migrate, db:migrate:deploy, db:push, db:seed, db:studio (+9 more)

### Community 44 - "Community 44"
Cohesion: 0.18
Nodes (12): SendTemplateMessageArgs, assertMessageTemplate(), isMessageTemplate(), buildBodyComponent(), buildButtonComponent(), buildHeaderComponent(), buildSendComponents(), buttonNeedsSendParam() (+4 more)

### Community 45 - "Community 45"
Cohesion: 0.22
Nodes (15): connectSse(), connectWebSocket(), consumerEnabled(), enqueueEvent(), handleEvent(), ParsedEvent, parseWahaEventData(), readTransport() (+7 more)

### Community 46 - "Community 46"
Cohesion: 0.12
Nodes (16): devDependencies, eslint, eslint-config-next, prettier, prettier-plugin-tailwindcss, prisma, tailwindcss, @tailwindcss/postcss (+8 more)

### Community 47 - "Community 47"
Cohesion: 0.30
Nodes (14): daysAgoStart(), DOW_SHORT_MON_FIRST, lastNDayKeys(), localDayKey(), mondayIndex(), startOfLocalDay(), DashboardPayload, dayBounds() (+6 more)

### Community 49 - "Community 49"
Cohesion: 0.24
Nodes (10): Ctx, DELETE(), GET(), PATCH(), GET(), POST(), AudienceFilter, parseAudienceFilter() (+2 more)

### Community 50 - "Community 50"
Cohesion: 0.27
Nodes (10): authorize(), POST(), GET(), POST(), runDispatch(), truncateError(), dispatchTiming(), MAX_DISPATCH_RECIPIENTS (+2 more)

### Community 51 - "Community 51"
Cohesion: 0.19
Nodes (11): PRESENCE_DOT_CLASS, derivePresence(), formatLastSeen(), HEARTBEAT_MS, IDLE_AFTER_MS, OFFLINE_AFTER_MS, presenceLabel(), PresenceRow (+3 more)

### Community 52 - "Community 52"
Cohesion: 0.21
Nodes (13): buildBodyComponent(), buildButtonPayload(), buildButtonsComponent(), buildFooterComponent(), buildHeaderComponent(), buildMetaTemplatePayload(), CATEGORY_TO_META, MetaButtonPayload (+5 more)

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (13): assertContiguous(), countButtonsByType(), extractVariableIndices(), HeaderValidationResult, TEMPLATE_LIMITS, baseValid, validateBody(), validateButtons() (+5 more)

### Community 54 - "Community 54"
Cohesion: 0.18
Nodes (12): ActivityFeedProps, KIND_THEME, KindTheme, PAGE_SIZES, PageSize, relativeTime(), ActivityItem, ActivityKind (+4 more)

### Community 55 - "Community 55"
Cohesion: 0.23
Nodes (12): fail(), InteractiveButton, InteractiveButtonsPayload, InteractiveListPayload, InteractiveListRow, InteractiveListSection, InteractiveValidation, ok() (+4 more)

### Community 56 - "Community 56"
Cohesion: 0.18
Nodes (8): react-dom, DropdownMenuCheckboxItem(), DropdownMenuGroup(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuShortcut(), DropdownMenuSubContent(), DropdownMenuSubTrigger()

### Community 57 - "Community 57"
Cohesion: 0.22
Nodes (11): groupNodeTypesByCategory(), NODE_CATEGORIES, NODE_HUE, NODE_META, NodeCategory, NodeColors, NodeIconChip(), NodeType (+3 more)

### Community 58 - "Community 58"
Cohesion: 0.21
Nodes (9): AutomationTemplateDefinition, TemplateSlug, TemplateStepSeed, TRIGGER_META, TriggerMeta, AutomationStepConfig, AutomationStepType, AutomationTriggerConfig (+1 more)

### Community 59 - "Community 59"
Cohesion: 0.19
Nodes (9): ContactFilters, CONVERSATION_SELECT, matchesContactFilters(), normalizeConversation(), normalizeConversations(), RawContact, RawConversation, Contact (+1 more)

### Community 60 - "Community 60"
Cohesion: 0.30
Nodes (9): buildPage(), Cursor, decodeCursor(), DEFAULT_LIMIT, encodeCursor(), keysetFilter(), ListParams, MAX_LIMIT (+1 more)

### Community 61 - "Community 61"
Cohesion: 0.23
Nodes (7): ApiError, ApiErrorCode, badRequest(), forbidden(), rateLimited(), unauthorized(), RateLimitResult

### Community 62 - "Community 62"
Cohesion: 0.26
Nodes (10): FlowInput, NodeInput, outgoingEdges(), reachableFromEntry(), validFlow, validNodes, validateFlowForActivation(), validateNode() (+2 more)

### Community 63 - "Community 63"
Cohesion: 0.25
Nodes (9): RFC-6585, buckets, checkRateLimit(), Entry, RateLimitOptions, rateLimitResponse(), __resetRateLimitForTests(), sweepExpired() (+1 more)

### Community 64 - "Community 64"
Cohesion: 0.36
Nodes (8): failNotRan(), firstSession(), loadEnvFiles(), main(), NOTE_PATH, writeNote(), classifyWahaTransport(), wahaEventsUrl()

### Community 65 - "Community 65"
Cohesion: 0.29
Nodes (10): ConversationsChart(), ConversationsChartProps, LegendDot(), LineSvg(), longDayLabel(), niceCeil(), PADDING, RangeDays (+2 more)

### Community 66 - "Community 66"
Cohesion: 0.22
Nodes (7): SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetPortal(), SheetTitle()

### Community 67 - "Community 67"
Cohesion: 0.24
Nodes (8): @dagrejs/dagre, autoLayout(), DEFAULTS, LayoutEdge, LayoutNode, LayoutOptions, LayoutPosition, shouldAutoLayout()

### Community 68 - "Community 68"
Cohesion: 0.29
Nodes (4): buildSignatureHeader(), body, verifySignatureHeader(), verifyMetaWebhookSignature()

### Community 69 - "Community 69"
Cohesion: 0.31
Nodes (6): Ctx, DELETE(), PATCH(), GET(), POST(), parseContactTypeInput()

### Community 70 - "Community 70"
Cohesion: 0.42
Nodes (8): AgentsPage(), Tab, AiPlayground(), Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 71 - "Community 71"
Cohesion: 0.33
Nodes (8): MessageActions(), QUICK_EMOJIS, Popover(), PopoverContent(), PopoverDescription(), PopoverHeader(), PopoverTitle(), PopoverTrigger()

### Community 72 - "Community 72"
Cohesion: 0.27
Nodes (4): calls, uploadResumableMedia(), ALLOWED_IMAGE_TYPES, ensureImageHeaderHandle()

### Community 73 - "Community 73"
Cohesion: 0.39
Nodes (7): nonEmpty(), StepLike, validateOne(), validateStepsForActivation(), validateTriggerForActivation(), ValidationIssue, walk()

### Community 74 - "Community 74"
Cohesion: 0.33
Nodes (7): broadcastStatusConfig, getBroadcastStatus(), getRecipientStatus(), recipientStatusConfig, StatusDisplay, BroadcastStatus, RecipientStatus

### Community 75 - "Community 75"
Cohesion: 0.36
Nodes (6): ingestWahaAck(), mapWahaAckToStatus(), shouldUpgradeStatus(), STATUS_RANK, WahaAckPayload, MessageStatus

### Community 76 - "Community 76"
Cohesion: 0.46
Nodes (6): API_SCOPES, ApiScope, hasScope(), isApiScope(), normalizeScopes(), SCOPE_DESCRIPTIONS

### Community 77 - "Community 77"
Cohesion: 0.29
Nodes (5): templateStatusConfig, TemplateStatusDisplay, ALLOWED, normalizeStatus(), MessageTemplateStatus

### Community 78 - "Community 78"
Cohesion: 0.39
Nodes (6): ApiWebhookEndpoint, generateWebhookSecret(), normalizeWebhookUrl(), serializeWebhookEndpoint(), WEBHOOK_PUBLIC_COLUMNS, WEBHOOK_SECRET_PREFIX

### Community 79 - "Community 79"
Cohesion: 0.32
Nodes (6): INTERACTIVE_LIMITS, sendInteractiveButtons(), sendInteractiveList(), BASE_ARGS, validateInteractiveBody(), validateInteractiveHeaderFooter()

### Community 80 - "Community 80"
Cohesion: 0.25
Nodes (3): opus-recorder, Recorder, RecorderConfig

### Community 81 - "Community 81"
Cohesion: 0.43
Nodes (3): RFC-1918, isDeliverableUrl(), isPrivateOrReservedIp()

### Community 83 - "Community 83"
Cohesion: 0.43
Nodes (5): ApiConversation, ApiMessage, serializeConversation(), serializeMessage(), Conversation

### Community 84 - "Community 84"
Cohesion: 0.48
Nodes (5): parseContactCsv(), ParseContactCsvResult, parseCsvLine(), ParsedContactRow, parseTagCell()

### Community 85 - "Community 85"
Cohesion: 0.52
Nodes (5): isWebhookEvent(), normalizeEvents(), WEBHOOK_EVENT_DESCRIPTIONS, WEBHOOK_EVENTS, WebhookEvent

### Community 86 - "Community 86"
Cohesion: 0.33
Nodes (3): BuilderInitial, BuilderStep, ServerStepNode

### Community 87 - "Community 87"
Cohesion: 0.33
Nodes (3): AccountAuthError, ForbiddenError, UnauthorizedError

### Community 89 - "Community 89"
Cohesion: 0.60
Nodes (4): Ctx, DELETE(), PATCH(), toErrorResponse()

### Community 90 - "Community 90"
Cohesion: 0.50
Nodes (4): DELETE(), GET(), PATCH(), POST()

### Community 91 - "Community 91"
Cohesion: 0.50
Nodes (4): DELETE(), GET(), PATCH(), POST()

### Community 92 - "Community 92"
Cohesion: 0.50
Nodes (4): DELETE(), GET(), PATCH(), POST()

### Community 93 - "Community 93"
Cohesion: 0.50
Nodes (4): DELETE(), GET(), PATCH(), POST()

### Community 94 - "Community 94"
Cohesion: 0.50
Nodes (4): DELETE(), GET(), PATCH(), POST()

### Community 95 - "Community 95"
Cohesion: 0.40
Nodes (3): contentType, runtime, size

### Community 97 - "Community 97"
Cohesion: 0.50
Nodes (3): MEDIA, MediaKind, messageBubble()

### Community 98 - "Community 98"
Cohesion: 0.40
Nodes (3): BASE, CapturedBody, sendMediaMessage()

### Community 99 - "Community 99"
Cohesion: 0.50
Nodes (3): eslintConfig, eslint, eslint-config-next

### Community 100 - "Community 100"
Cohesion: 0.67
Nodes (3): DeltaRow(), MetricCard(), MetricCardProps

## Knowledge Gaps
- **19 isolated node(s):** `{ GET, POST }`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `prettier`, `prettier-plugin-tailwindcss` (+14 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 673 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **42 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Community 26` to `Community 2`, `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 13`, `Community 15`, `Community 19`, `Community 22`, `Community 23`, `Community 25`, `Community 27`, `Community 28`, `Community 29`, `Community 30`, `Community 31`, `Community 33`, `Community 36`, `Community 37`, `Community 38`, `Community 39`, `Community 40`, `Community 49`, `Community 50`, `Community 54`, `Community 61`, `Community 63`, `Community 69`, `Community 89`, `Community 90`, `Community 91`, `Community 92`, `Community 93`, `Community 94`, `Community 95`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **What connects `{ GET, POST }`, `@dnd-kit/sortable`, `@dnd-kit/utilities` to the rest of the system?**
  _19 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05452402004126142 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Community 48` to `Community 0`, `Community 3`, `Community 4`, `Community 11`, `Community 15`, `Community 17`, `Community 18`, `Community 20`, `Community 25`, `Community 28`, `Community 29`, `Community 31`, `Community 34`, `Community 36`, `Community 39`, `Community 44`, `Community 45`, `Community 49`, `Community 50`, `Community 51`, `Community 52`, `Community 53`, `Community 55`, `Community 56`, `Community 57`, `Community 59`, `Community 60`, `Community 62`, `Community 63`, `Community 64`, `Community 67`, `Community 68`, `Community 69`, `Community 72`, `Community 73`, `Community 74`, `Community 75`, `Community 76`, `Community 77`, `Community 78`, `Community 79`, `Community 81`, `Community 83`, `Community 84`, `Community 85`, `Community 97`, `Community 98`, `Community 106`, `Community 107`, `Community 111`, `Community 112`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07151898734177216 - nodes in this community are weakly interconnected._
- **Why does `prisma` connect `Community 22` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 13`, `Community 25`, `Community 26`, `Community 28`, `Community 29`, `Community 30`, `Community 31`, `Community 33`, `Community 34`, `Community 36`, `Community 37`, `Community 39`, `Community 40`, `Community 42`, `Community 45`, `Community 47`, `Community 49`, `Community 50`, `Community 69`, `Community 75`, `Community 89`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07368421052631578 - nodes in this community are weakly interconnected._