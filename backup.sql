--
-- PostgreSQL database dump
--

\restrict uYhxrQ8gViueAYvtOfSXjRrvMwGxBJzBwhAIJNqBDhszGh8il7NNVTaoAbFZKup

-- Dumped from database version 15.15 (Debian 15.15-1.pgdg13+1)
-- Dumped by pg_dump version 15.15 (Debian 15.15-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: budget_realization; Type: TABLE; Schema: public; Owner: sales
--

CREATE TABLE public.budget_realization (
    id bigint NOT NULL,
    budget_id bigint NOT NULL,
    category text NOT NULL,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT budget_realization_amount_positive CHECK ((amount > (0)::numeric))
);


ALTER TABLE public.budget_realization OWNER TO sales;

--
-- Name: budget_realization_id_seq; Type: SEQUENCE; Schema: public; Owner: sales
--

CREATE SEQUENCE public.budget_realization_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.budget_realization_id_seq OWNER TO sales;

--
-- Name: budget_realization_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sales
--

ALTER SEQUENCE public.budget_realization_id_seq OWNED BY public.budget_realization.id;


--
-- Name: budgets; Type: TABLE; Schema: public; Owner: sales
--

CREATE TABLE public.budgets (
    id bigint NOT NULL,
    division text NOT NULL,
    month date NOT NULL,
    budget_amount numeric(18,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT budgets_division_check CHECK ((division = ANY (ARRAY['NetCo'::text, 'Oil Gas & Mining'::text, 'IT Solutions'::text])))
);


ALTER TABLE public.budgets OWNER TO sales;

--
-- Name: budgets_id_seq; Type: SEQUENCE; Schema: public; Owner: sales
--

CREATE SEQUENCE public.budgets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.budgets_id_seq OWNER TO sales;

--
-- Name: budgets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sales
--

ALTER SEQUENCE public.budgets_id_seq OWNED BY public.budgets.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: sales
--

CREATE TABLE public.customers (
    id bigint NOT NULL,
    name text NOT NULL,
    industry text,
    region text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.customers OWNER TO sales;

--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: sales
--

CREATE SEQUENCE public.customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.customers_id_seq OWNER TO sales;

--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sales
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: project_postpo_monitoring; Type: TABLE; Schema: public; Owner: sales
--

CREATE TABLE public.project_postpo_monitoring (
    project_id bigint NOT NULL,
    stage1_status text DEFAULT 'Not Started'::text NOT NULL,
    stage2_status text DEFAULT 'Not Started'::text NOT NULL,
    stage3_status text DEFAULT 'Not Started'::text NOT NULL,
    stage4_status text DEFAULT 'Not Started'::text NOT NULL,
    stage5_status text DEFAULT 'Not Started'::text NOT NULL,
    stage1_date date,
    stage2_date date,
    stage3_date date,
    stage4_date date,
    stage5_date date,
    stage1_note text,
    stage2_note text,
    stage3_note text,
    stage4_note text,
    stage5_note text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ppm_s1 CHECK ((stage1_status = ANY (ARRAY['Not Started'::text, 'In Progress'::text, 'Done'::text]))),
    CONSTRAINT ppm_s2 CHECK ((stage2_status = ANY (ARRAY['Not Started'::text, 'In Progress'::text, 'Done'::text]))),
    CONSTRAINT ppm_s3 CHECK ((stage3_status = ANY (ARRAY['Not Started'::text, 'In Progress'::text, 'Done'::text]))),
    CONSTRAINT ppm_s4 CHECK ((stage4_status = ANY (ARRAY['Not Started'::text, 'In Progress'::text, 'Done'::text]))),
    CONSTRAINT ppm_s5 CHECK ((stage5_status = ANY (ARRAY['Not Started'::text, 'In Progress'::text, 'Done'::text])))
);


ALTER TABLE public.project_postpo_monitoring OWNER TO sales;

--
-- Name: project_revenue_plan; Type: TABLE; Schema: public; Owner: sales
--

CREATE TABLE public.project_revenue_plan (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    month date NOT NULL,
    target_revenue numeric(18,2) DEFAULT 0 NOT NULL,
    target_realization numeric(18,2) DEFAULT 0 NOT NULL
);


ALTER TABLE public.project_revenue_plan OWNER TO sales;

--
-- Name: project_revenue_plan_id_seq; Type: SEQUENCE; Schema: public; Owner: sales
--

CREATE SEQUENCE public.project_revenue_plan_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.project_revenue_plan_id_seq OWNER TO sales;

--
-- Name: project_revenue_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sales
--

ALTER SEQUENCE public.project_revenue_plan_id_seq OWNED BY public.project_revenue_plan.id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: sales
--

CREATE TABLE public.projects (
    id bigint NOT NULL,
    project_code text NOT NULL,
    description text,
    customer_id bigint,
    division text NOT NULL,
    status text NOT NULL,
    project_type text NOT NULL,
    sph_status text,
    sph_release_date date,
    sales_stage integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sph_release_status text DEFAULT 'No'::text,
    sph_number text,
    CONSTRAINT projects_division_check CHECK ((division = ANY (ARRAY['NetCo'::text, 'Oil Gas & Mining'::text, 'IT Solutions'::text]))),
    CONSTRAINT projects_project_type_check CHECK ((project_type = ANY (ARRAY['Project Based'::text, 'Recurring'::text, 'New Recurring'::text]))),
    CONSTRAINT projects_sales_stage_check CHECK (((sales_stage >= 1) AND (sales_stage <= 6))),
    CONSTRAINT projects_sph_release_status_check CHECK ((sph_release_status = ANY (ARRAY['Yes'::text, 'No'::text]))),
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['Carry Over'::text, 'Prospect'::text, 'New Prospect'::text]))),
    CONSTRAINT sales_stage_check CHECK (((sales_stage >= 1) AND (sales_stage <= 6)))
);


ALTER TABLE public.projects OWNER TO sales;

--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: sales
--

CREATE SEQUENCE public.projects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.projects_id_seq OWNER TO sales;

--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sales
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: revenue_actual; Type: TABLE; Schema: public; Owner: sales
--

CREATE TABLE public.revenue_actual (
    id bigint NOT NULL,
    project_id bigint,
    month date NOT NULL,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    source text DEFAULT 'manual'::text
);


ALTER TABLE public.revenue_actual OWNER TO sales;

--
-- Name: revenue_actual_id_seq; Type: SEQUENCE; Schema: public; Owner: sales
--

CREATE SEQUENCE public.revenue_actual_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.revenue_actual_id_seq OWNER TO sales;

--
-- Name: revenue_actual_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sales
--

ALTER SEQUENCE public.revenue_actual_id_seq OWNED BY public.revenue_actual.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: sales
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    division text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'user'::text])))
);


ALTER TABLE public.users OWNER TO sales;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: sales
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.users_id_seq OWNER TO sales;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sales
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: budget_realization id; Type: DEFAULT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.budget_realization ALTER COLUMN id SET DEFAULT nextval('public.budget_realization_id_seq'::regclass);


--
-- Name: budgets id; Type: DEFAULT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.budgets ALTER COLUMN id SET DEFAULT nextval('public.budgets_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: project_revenue_plan id; Type: DEFAULT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.project_revenue_plan ALTER COLUMN id SET DEFAULT nextval('public.project_revenue_plan_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: revenue_actual id; Type: DEFAULT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.revenue_actual ALTER COLUMN id SET DEFAULT nextval('public.revenue_actual_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: budget_realization; Type: TABLE DATA; Schema: public; Owner: sales
--

COPY public.budget_realization (id, budget_id, category, amount, note, created_at, updated_at) FROM stdin;
3	6	AKOMODASI PERDIN MARKETING	7791706.00		2025-12-14 08:06:29.756386	2025-12-14 08:06:29.756386
4	6	ENT & REP	30971500.00		2025-12-14 08:06:36.47109	2025-12-14 08:06:36.47109
5	7	AKOMODASI PERDIN MARKETING	8621029.00		2025-12-14 08:07:22.490407	2025-12-14 08:07:22.490407
6	7	ENT & REP	13221036.00		2025-12-14 08:10:29.711378	2025-12-14 08:10:29.711378
7	8	AKOMODASI PERDIN MARKETING	8223100.00		2025-12-14 08:10:47.999947	2025-12-14 08:10:47.999947
8	8	ENT & REP	3468100.00		2025-12-14 08:10:55.717316	2025-12-14 08:10:55.717316
9	9	AKOMODASI PERDIN MARKETING	8721632.00		2025-12-14 08:11:10.72076	2025-12-14 08:11:10.72076
10	9	ENT & REP	12811608.00		2025-12-14 08:11:18.825497	2025-12-14 08:11:18.825497
11	10	AKOMODASI PERDIN MARKETING	7700831.00		2025-12-14 08:11:50.714502	2025-12-14 08:11:50.714502
12	10	ENT & REP	6248785.00		2025-12-14 08:12:00.152491	2025-12-14 08:12:00.152491
13	10	OPERASIONAL MARKETING	60000.00		2025-12-14 08:12:09.076973	2025-12-14 08:12:09.076973
14	11	AKOMODASI PERDIN MARKETING	6038946.00		2025-12-14 08:12:33.920187	2025-12-14 08:12:33.920187
15	11	ENT & REP	2967900.00		2025-12-14 08:12:41.208054	2025-12-14 08:12:41.208054
16	11	OPERASIONAL MARKETING	361000.00		2025-12-14 08:12:47.95358	2025-12-14 08:12:47.95358
17	12	AKOMODASI PERDIN MARKETING	8532033.00		2025-12-14 08:13:09.425915	2025-12-14 08:13:09.425915
18	12	ENT & REP	5506419.00		2025-12-14 08:13:17.452189	2025-12-14 08:13:17.452189
19	13	AKOMODASI PERDIN MARKETING	7753600.00		2025-12-14 08:13:31.588561	2025-12-14 08:13:31.588561
20	13	ENT & REP	6232143.00		2025-12-14 08:13:41.597185	2025-12-14 08:13:41.597185
21	14	AKOMODASI PERDIN MARKETING	10645767.00		2025-12-14 08:14:07.594914	2025-12-14 08:14:07.594914
22	14	ENT & REP	10200827.00		2025-12-14 08:14:16.131536	2025-12-14 08:14:16.131536
23	15	AKOMODASI PERDIN MARKETING	9089332.00		2025-12-14 08:14:39.324146	2025-12-14 08:14:39.324146
24	15	ENT & REP	12337457.00		2025-12-14 08:14:45.378889	2025-12-14 08:14:45.378889
26	16	AKOMODASI PERDIN MARKETING	9496265.00		2025-12-14 08:15:08.447008	2025-12-14 08:15:08.447008
27	16	ENT & REP	8483316.00		2025-12-14 08:15:15.863305	2025-12-14 08:15:15.863305
30	6	OPERASIONAL MARKETING	1500000.00		2025-12-14 08:15:55.989996	2025-12-14 08:15:55.989996
25	15	AKOMODASI TENDER	1000000.00		2025-12-14 08:14:54.373098	2025-12-14 10:30:55.491462
32	6	AKOMODASI TENDER	700000.00		2025-12-14 10:42:46.486591	2025-12-14 10:42:46.486591
29	17	ENT & REP	5565399.00		2025-12-14 08:15:43.565847	2026-01-05 01:41:20.736009
28	17	AKOMODASI PERDIN MARKETING	5159544.00		2025-12-14 08:15:34.41439	2026-01-05 02:32:26.926424
\.


--
-- Data for Name: budgets; Type: TABLE DATA; Schema: public; Owner: sales
--

COPY public.budgets (id, division, month, budget_amount, created_at, updated_at) FROM stdin;
6	IT Solutions	2025-01-01	31380000.00	2025-12-14 08:02:08.222822	2025-12-14 08:02:08.222822
7	IT Solutions	2025-02-01	29380000.00	2025-12-14 08:02:21.968049	2025-12-14 08:02:21.968049
8	IT Solutions	2025-03-01	26880000.00	2025-12-14 08:02:34.828091	2025-12-14 08:02:34.828091
9	IT Solutions	2025-04-01	24380000.00	2025-12-14 08:02:55.299088	2025-12-14 08:02:55.299088
10	IT Solutions	2025-05-01	24380000.00	2025-12-14 08:03:03.627041	2025-12-14 08:03:03.627041
11	IT Solutions	2025-06-01	24380000.00	2025-12-14 08:03:15.176033	2025-12-14 08:03:15.176033
12	IT Solutions	2025-07-01	24380000.00	2025-12-14 08:03:19.497903	2025-12-14 08:03:19.497903
13	IT Solutions	2025-08-01	24380000.00	2025-12-14 08:03:25.83639	2025-12-14 08:03:25.83639
14	IT Solutions	2025-09-01	24380000.00	2025-12-14 08:03:31.173038	2025-12-14 08:03:31.173038
15	IT Solutions	2025-10-01	24380000.00	2025-12-14 08:03:39.533797	2025-12-14 08:03:39.533797
16	IT Solutions	2025-11-01	24380000.00	2025-12-14 08:03:43.968166	2025-12-14 08:03:43.968166
17	IT Solutions	2025-12-01	24380000.00	2025-12-14 08:03:51.995125	2025-12-14 08:03:51.995125
18	NetCo	2025-01-01	10000000.00	2025-12-23 10:59:27.113874	2025-12-23 10:59:27.113874
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: sales
--

COPY public.customers (id, name, industry, region, created_at, updated_at) FROM stdin;
3	PT XLSmart Telecom Sejahtera Tbk	Telekomunikasi	-	2025-12-09 12:56:43.812204+00	2025-12-09 12:56:43.812204+00
4	PT Wahana Raya Sentosa	-	-	2025-12-09 12:57:31.108908+00	2025-12-09 12:57:31.108908+00
5	Pusjaspermildas	-	-	2025-12-10 04:59:58.832978+00	2025-12-10 04:59:58.832978+00
6	PTPN Medan	Pengelola Kawasan		2025-12-14 13:24:15.381454+00	2025-12-14 13:24:15.381454+00
7	RS Sanglah Bali	Hospitality		2025-12-14 13:24:30.880907+00	2025-12-14 13:24:30.880907+00
8	Perum Damri	Transportasi		2025-12-15 00:37:47.988281+00	2025-12-15 00:37:47.988281+00
9	PT Zeepos Teknotama Mandiri	Teknologi		2025-12-15 00:38:22.888356+00	2025-12-15 00:38:22.888356+00
10	PT. Transportasi Jakarta			2025-12-15 00:47:21.369225+00	2025-12-15 00:47:21.369225+00
11	PAM Jaya			2025-12-15 00:54:14.64456+00	2025-12-15 00:54:14.64456+00
12	Satsiber TNI	Militer		2025-12-15 02:05:15.902391+00	2025-12-15 02:05:15.902391+00
13	PT Metranet	Telekomunikasi		2025-12-16 03:13:59.83282+00	2025-12-16 03:13:59.83282+00
14	Disjasad	Militer		2025-12-16 03:17:08.090281+00	2025-12-16 03:17:08.090281+00
15	Satkomlek Mabes TNI	Militer	Jakarta	2026-01-05 01:55:59.84814+00	2026-01-05 01:55:59.84814+00
16	Pemkot Bogor	Pemerintahan		2026-01-05 01:59:49.64136+00	2026-01-05 01:59:49.64136+00
17	Kemdiktisaintek	Pemerintahan		2026-01-05 02:03:40.088804+00	2026-01-05 02:03:40.088804+00
18	Kementerian Pertanian	Pemerintahan		2026-01-05 02:08:14.67466+00	2026-01-05 02:08:14.67466+00
19	PT Lativi Mediakarya			2026-01-05 02:14:16.073255+00	2026-01-05 02:14:16.073255+00
20	Kementerian Kesehatan	Pemerintahan		2026-01-05 02:23:03.908225+00	2026-01-05 02:23:03.908225+00
21	Kementerian Dalam Negeri	Pemerintahan		2026-01-05 02:26:30.728262+00	2026-01-05 02:26:30.728262+00
22	Hariff Power Services	Power System		2026-01-05 03:10:01.764545+00	2026-01-05 03:10:01.764545+00
\.


--
-- Data for Name: project_postpo_monitoring; Type: TABLE DATA; Schema: public; Owner: sales
--

COPY public.project_postpo_monitoring (project_id, stage1_status, stage2_status, stage3_status, stage4_status, stage5_status, stage1_date, stage2_date, stage3_date, stage4_date, stage5_date, stage1_note, stage2_note, stage3_note, stage4_note, stage5_note, updated_at) FROM stdin;
62	Not Started	Not Started	Not Started	Not Started	Not Started	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2025-12-16 09:09:23.863513+00
43	Done	Done	Done	Done	Done	2025-01-01	2025-01-01	2025-08-01	2025-10-01	2025-12-01	\N	\N	\N	\N	\N	2025-12-16 11:20:59.057151+00
63	Not Started	Not Started	Not Started	Not Started	Not Started	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2025-12-17 09:38:44.638135+00
64	Done	In Progress	Not Started	Not Started	Not Started	2025-12-08	2025-12-10	\N	\N	\N	\N	\N	\N	\N	\N	2025-12-17 09:40:53.203132+00
53	Done	In Progress	Not Started	Not Started	Not Started	2025-11-17	2025-11-24	\N	\N	\N	\N	\N	\N	\N	\N	2025-12-17 09:41:25.709471+00
67	Not Started	Not Started	Not Started	Not Started	Not Started	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-01-05 02:05:44.618764+00
68	Not Started	Not Started	Not Started	Not Started	Not Started	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-01-05 02:06:03.023124+00
72	Not Started	Not Started	Not Started	Not Started	Not Started	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-01-05 02:19:33.730761+00
74	Not Started	Not Started	Not Started	Not Started	Not Started	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-01-05 02:27:49.815756+00
75	Not Started	Not Started	Not Started	Not Started	Not Started	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-01-05 03:11:40.368531+00
\.


--
-- Data for Name: project_revenue_plan; Type: TABLE DATA; Schema: public; Owner: sales
--

COPY public.project_revenue_plan (id, project_id, month, target_revenue, target_realization) FROM stdin;
43	43	2025-01-01	5817721250.00	5817721250.00
44	44	2025-11-01	2980000000.00	0.00
45	45	2025-11-01	2996000000.00	0.00
46	46	2025-09-01	1801900000.00	0.00
47	47	2025-09-01	2250000000.00	0.00
48	48	2025-12-01	137500000.00	137500000.00
50	50	2025-05-01	912993000.00	0.00
52	52	2025-04-01	112014000.00	0.00
53	53	2025-12-01	128000.00	128000.00
54	54	2025-12-01	3600000000.00	0.00
55	55	2025-09-01	9109620000.00	0.00
56	56	2025-09-01	1759000000.00	0.00
57	57	2025-06-01	2545500000.00	0.00
58	58	2025-11-01	2702334000.00	0.00
60	59	2025-05-01	2400000000.00	0.00
62	51	2025-05-01	1998714000.00	0.00
63	60	2025-12-01	3025000000.00	0.00
64	49	2025-10-01	5585586000.00	0.00
65	61	2025-10-01	367600000.00	0.00
66	62	2025-08-01	4500000000.00	0.00
68	63	2025-12-01	42400000.00	0.00
69	64	2025-12-01	51200000.00	0.00
70	65	2025-10-01	1809258000.00	0.00
71	66	2025-03-01	1500000000.00	0.00
74	69	2025-04-01	21600000000.00	0.00
75	67	2025-06-01	1500000000.00	0.00
76	68	2025-05-01	27000000000.00	0.00
77	70	2025-03-01	2000000000.00	0.00
78	71	2025-06-01	63000000000.00	0.00
83	72	2025-09-01	1857500000.00	0.00
84	72	2025-10-01	242282609.00	0.00
85	72	2025-11-01	242282609.00	0.00
86	72	2025-12-01	242282609.00	0.00
87	73	2025-11-01	1700000000.00	0.00
89	74	2025-11-01	61000000000.00	0.00
90	75	2025-12-01	3294173056.00	3294173056.00
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: sales
--

COPY public.projects (id, project_code, description, customer_id, division, status, project_type, sph_status, sph_release_date, sales_stage, created_at, updated_at, sph_release_status, sph_number) FROM stdin;
43	PRJ-ITS-2025-0001	Instalasi Haryono Data Center	4	IT Solutions	Carry Over	Project Based	Win	2025-01-01	6	2025-12-14 13:12:25.685535+00	2025-12-14 13:12:25.685535+00	No	\N
44	PRJ-ITS-2025-0002	Wall Display & RFID	3	IT Solutions	Prospect	Project Based	Open	\N	1	2025-12-14 13:22:57.885563+00	2025-12-14 13:22:57.885563+00	No	\N
45	PRJ-ITS-2025-0003	Pembangunan Autogate System	3	IT Solutions	Prospect	Project Based	Open	\N	1	2025-12-14 13:23:30.045846+00	2025-12-14 13:23:30.045846+00	No	\N
46	PRJ-ITS-2025-0004	CCTV & Video Analytics	6	IT Solutions	Prospect	Project Based	\N	\N	1	2025-12-14 13:25:04.019381+00	2025-12-14 13:25:04.019381+00	No	\N
47	PRJ-ITS-2025-0005	IoT dan Energy Saving	7	IT Solutions	Prospect	Project Based	\N	\N	1	2025-12-14 13:25:36.616563+00	2025-12-14 13:25:36.616563+00	No	\N
48	PRJ-ITS-2025-0006	Pengadaan Bus Damri dan Monitoring	8	IT Solutions	New Prospect	New Recurring	\N	\N	6	2025-12-15 00:39:37.831508+00	2025-12-15 00:39:37.831508+00	No	\N
50	PRJ-ITS-2025-0008	Upgrade TZR System	5	IT Solutions	New Prospect	Project Based	Open	\N	4	2025-12-15 00:45:20.360947+00	2025-12-15 00:45:20.360947+00	No	\N
52	PRJ-ITS-2025-0010	Pengadaan 6 Tablet Samsung	10	IT Solutions	New Prospect	Project Based	Drop	\N	4	2025-12-15 00:48:44.020709+00	2025-12-15 00:48:44.020709+00	No	\N
53	PRJ-ITS-2025-0011	Mini PC 100 Pcs	9	IT Solutions	New Prospect	New Recurring	Win	2025-11-06	6	2025-12-15 00:51:33.540616+00	2025-12-15 00:51:33.540616+00	Yes	242/SLS-e/SCOM/11/2025
54	PRJ-ITS-2025-0012	Pengadaan Intrusion Prevention System (IPS)	11	IT Solutions	New Prospect	Project Based	\N	\N	1	2025-12-15 00:55:10.194694+00	2025-12-15 00:55:10.194694+00	No	\N
55	PRJ-ITS-2025-0013	Pengadaan Tab Samsung Active 5	10	IT Solutions	Prospect	Project Based	Open	\N	2	2025-12-15 02:02:56.840193+00	2025-12-15 02:02:56.840193+00	No	\N
56	PRJ-ITS-2025-0014	Pengadaan PC & Monitor	10	IT Solutions	Prospect	Project Based	Open	\N	2	2025-12-15 02:03:42.994618+00	2025-12-15 02:03:42.994618+00	No	\N
57	PRJ-ITS-2025-0015	Maintenance Osint 2025	12	IT Solutions	Prospect	Project Based	\N	\N	2	2025-12-15 02:05:44.390665+00	2025-12-15 02:05:44.390665+00	No	\N
58	PRJ-ITS-2025-0016	Buzzer System	12	IT Solutions	Prospect	Project Based	Open	\N	2	2025-12-15 02:07:04.184942+00	2025-12-15 02:07:04.184942+00	No	\N
59	PRJ-ITS-2025-0017	Pengadaan Laptop	8	IT Solutions	Prospect	Project Based	Open	\N	2	2025-12-15 03:10:38.901625+00	2025-12-15 03:20:21.329863+00	No	\N
51	PRJ-ITS-2025-0009	Sistem Informasi Samapta	5	IT Solutions	New Prospect	Project Based	Open	\N	4	2025-12-15 00:46:03.301828+00	2025-12-16 03:15:49.584552+00	No	\N
60	PRJ-ITS-2025-0018	Ticketing System	13	IT Solutions	Prospect	Project Based	Open	\N	2	2025-12-16 03:14:39.174447+00	2025-12-16 03:16:10.892157+00	No	\N
49	PRJ-ITS-2025-0007	Sarpras Multimedia Room	5	IT Solutions	New Prospect	Project Based	\N	\N	4	2025-12-15 00:41:45.812175+00	2025-12-16 03:16:37.061738+00	No	\N
61	PRJ-ITS-2025-0019	Chinning System (Sertifikasi)	14	IT Solutions	Prospect	Project Based	Open	\N	1	2025-12-16 03:17:37.623603+00	2025-12-16 03:17:37.623603+00	No	\N
62	PRJ-ITS-2025-0020	Barrier Gate	3	IT Solutions	Prospect	Project Based	\N	\N	2	2025-12-16 03:20:32.641328+00	2025-12-16 03:20:32.641328+00	No	\N
63	PRJ-ITS-2025-0021	MPOS Sunmi P2	9	IT Solutions	New Prospect	New Recurring	Win	2025-12-05	6	2025-12-17 09:38:39.151214+00	2025-12-17 09:39:00.267117+00	Yes	274/SLS-e/SCOM/12/2025
64	PRJ-ITS-2025-0022	Mini PC 400	9	IT Solutions	New Prospect	New Recurring	Win	2025-12-05	6	2025-12-17 09:40:04.145234+00	2025-12-17 09:40:04.145234+00	Yes	275/SLS-e/SCOM/12/2025
65	PRJ-ITS-2026-0001	Material dan Jasa Instalasi RS Eka Hospital	3	IT Solutions	New Prospect	Project Based	Loss	2025-09-04	5	2026-01-05 01:54:07.288251+00	2026-01-05 01:54:07.288251+00	Yes	158/SLS-DIT/SCOM/07/2025_Rev4
66	PRJ-ITS-2026-0002	Har Belanja Peralatan Sound System	15	IT Solutions	New Prospect	Project Based	Drop	\N	2	2026-01-05 01:57:08.45808+00	2026-01-05 01:57:08.45808+00	No	\N
69	PRJ-ITS-2026-0005	Pengadaan Smartboard System	17	IT Solutions	New Prospect	Project Based	Drop	\N	2	2026-01-05 02:05:41.442569+00	2026-01-05 02:05:41.442569+00	No	\N
67	PRJ-ITS-2026-0003	HAR Satkomlek	15	IT Solutions	New Prospect	Project Based	Drop	\N	2	2026-01-05 01:59:03.525531+00	2026-01-05 02:05:48.55475+00	No	\N
68	PRJ-ITS-2026-0004	Pengadaan PJUTS	16	IT Solutions	New Prospect	Project Based	Drop	\N	2	2026-01-05 02:00:36.282718+00	2026-01-05 02:06:05.671358+00	No	\N
70	PRJ-ITS-2026-0006	Pengadaan Cyber Attack System	12	IT Solutions	New Prospect	Project Based	Drop	\N	2	2026-01-05 02:07:40.311426+00	2026-01-05 02:07:40.311426+00	No	\N
71	PRJ-ITS-2026-0007	Pengadaan Drone Sprayer	18	IT Solutions	New Prospect	Project Based	Drop	\N	2	2026-01-05 02:12:53.164307+00	2026-01-05 02:12:53.164307+00	No	\N
72	PRJ-ITS-2026-0008	Alat Pemancar TV	19	IT Solutions	New Prospect	New Recurring	Drop	\N	5	2026-01-05 02:18:26.792378+00	2026-01-05 02:20:16.114207+00	No	\N
73	PRJ-ITS-2026-0009	Jasa Instalasi Fasyankes	20	IT Solutions	New Prospect	Project Based	Drop	\N	2	2026-01-05 02:24:23.417736+00	2026-01-05 02:24:23.417736+00	No	\N
74	PRJ-ITS-2026-0010	Revitalisasi Server	21	IT Solutions	New Prospect	Project Based	Drop	\N	2	2026-01-05 02:27:38.697058+00	2026-01-05 02:27:56.845874+00	No	\N
75	PRJ-ITS-2026-0011	PCB Assy Control Board1	22	IT Solutions	New Prospect	Project Based	Win	\N	6	2026-01-05 03:11:36.275079+00	2026-01-05 03:11:36.275079+00	No	\N
\.


--
-- Data for Name: revenue_actual; Type: TABLE DATA; Schema: public; Owner: sales
--

COPY public.revenue_actual (id, project_id, month, amount, source) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: sales
--

COPY public.users (id, username, password_hash, role, division, created_at, updated_at) FROM stdin;
2	admin	$2a$10$l5Dj9PRqigwMszkS8NNPweUZ/JK0HqCItIuyWcAOBYAAy09/vKkuW	admin		2025-12-11 11:09:04.869445+00	2025-12-11 11:09:04.869445+00
3	andriputra	$2a$10$7CwmOcWtXm0ShAi54tcP8.8.l.ex7xXZi2lx0y/jDRYkAnLS1C.iC	user	IT Solutions	2025-12-11 14:07:20.923843+00	2025-12-11 14:07:20.923843+00
4	sigitp	$2a$10$/ognvkRp1AxGWBqc8oyzYeidp86k92xNaug/lR8IsAU.QtNI3dGKC	user	NetCo	2025-12-14 07:49:14.757593+00	2025-12-23 10:29:20.527385+00
\.


--
-- Name: budget_realization_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sales
--

SELECT pg_catalog.setval('public.budget_realization_id_seq', 32, true);


--
-- Name: budgets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sales
--

SELECT pg_catalog.setval('public.budgets_id_seq', 18, true);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sales
--

SELECT pg_catalog.setval('public.customers_id_seq', 22, true);


--
-- Name: project_revenue_plan_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sales
--

SELECT pg_catalog.setval('public.project_revenue_plan_id_seq', 90, true);


--
-- Name: projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sales
--

SELECT pg_catalog.setval('public.projects_id_seq', 75, true);


--
-- Name: revenue_actual_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sales
--

SELECT pg_catalog.setval('public.revenue_actual_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: sales
--

SELECT pg_catalog.setval('public.users_id_seq', 4, true);


--
-- Name: budget_realization budget_realization_pkey; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.budget_realization
    ADD CONSTRAINT budget_realization_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_division_month_key; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_division_month_key UNIQUE (division, month);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: project_postpo_monitoring project_postpo_monitoring_pkey; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.project_postpo_monitoring
    ADD CONSTRAINT project_postpo_monitoring_pkey PRIMARY KEY (project_id);


--
-- Name: project_revenue_plan project_revenue_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.project_revenue_plan
    ADD CONSTRAINT project_revenue_plan_pkey PRIMARY KEY (id);


--
-- Name: project_revenue_plan project_revenue_plan_project_id_month_key; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.project_revenue_plan
    ADD CONSTRAINT project_revenue_plan_project_id_month_key UNIQUE (project_id, month);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_project_code_key; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_project_code_key UNIQUE (project_code);


--
-- Name: revenue_actual revenue_actual_pkey; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.revenue_actual
    ADD CONSTRAINT revenue_actual_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_budget_realization_budget_id; Type: INDEX; Schema: public; Owner: sales
--

CREATE INDEX idx_budget_realization_budget_id ON public.budget_realization USING btree (budget_id);


--
-- Name: idx_budget_realization_budget_id_created_at; Type: INDEX; Schema: public; Owner: sales
--

CREATE INDEX idx_budget_realization_budget_id_created_at ON public.budget_realization USING btree (budget_id, created_at DESC);


--
-- Name: budget_realization budget_realization_budget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.budget_realization
    ADD CONSTRAINT budget_realization_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.budgets(id) ON DELETE CASCADE;


--
-- Name: project_postpo_monitoring project_postpo_monitoring_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.project_postpo_monitoring
    ADD CONSTRAINT project_postpo_monitoring_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_revenue_plan project_revenue_plan_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.project_revenue_plan
    ADD CONSTRAINT project_revenue_plan_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: revenue_actual revenue_actual_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sales
--

ALTER TABLE ONLY public.revenue_actual
    ADD CONSTRAINT revenue_actual_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- PostgreSQL database dump complete
--

\unrestrict uYhxrQ8gViueAYvtOfSXjRrvMwGxBJzBwhAIJNqBDhszGh8il7NNVTaoAbFZKup

