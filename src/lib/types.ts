// Core domain model for Rabbit Hole.

export type Domain =
  | 'science'
  | 'technology'
  | 'history'
  | 'art'
  | 'music'
  | 'philosophy'
  | 'psychology'
  | 'nature'
  | 'economics'
  | 'language'
  | 'math'
  | 'space'
  | 'food'
  | 'body'
  | 'design'
  | 'society'
  | 'craft';

export type TaskKind =
  | 'read'
  | 'watch'
  | 'listen'
  | 'do'
  | 'build'
  | 'reflect'
  | 'explain'
  | 'quiz'
  | 'explore'
  | 'revisit';

export type Understanding = 1 | 2 | 3; // fuzzy · getting it · clicked

export interface ResourceHint {
  title: string;
  /** What to type into a search box. We build links from this instead of trusting model-made URLs. */
  query: string;
  type?: 'article' | 'video' | 'book' | 'paper' | 'podcast' | 'tool' | 'course' | 'other';
}

export interface Task {
  id: string;
  title: string;
  kind: TaskKind;
  minutes: number;
  description: string;
  /** Why this task matters for understanding (not just completion). */
  why: string;
  /** A question you should be able to answer after the task. */
  checkpoint: string;
  resource?: ResourceHint;
  optional?: boolean;
  done: boolean;
  doneAt?: string;
  skipped?: boolean;
  note?: string;
  understanding?: Understanding;
  spentMinutes?: number;
}

export interface Day {
  index: number; // 0..6
  date: string; // YYYY-MM-DD
  theme: string;
  goal: string;
  budget: number; // minutes
  tasks: Task[];
  reflection?: string;
  mood?: 1 | 2 | 3 | 4 | 5;
}

export interface Concept {
  id: string;
  term: string;
  explanation: string;
  status: 'new' | 'fuzzy' | 'clear';
}

export interface Brief {
  summary: string;
  whyFascinating: string;
  concepts: Concept[];
  guidingQuestions: string[];
  misconceptions: string[];
  resources: ResourceHint[];
  arc: { theme: string; goal: string }[]; // 7 entries
  rabbitTrails: string[]; // tangents for later
}

export interface CuriosityQuestion {
  id: string;
  text: string;
  createdAt: string;
  dayIndex: number;
  answer?: string;
  resolved?: boolean;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  kind: 'mcq' | 'open';
  options?: string[];
  answerIndex?: number;
  modelAnswer: string;
  concept?: string;
}

export interface QuizAttempt {
  id: string;
  createdAt: string;
  questions: QuizQuestion[];
  responses: (number | string | null)[];
  selfMarks: (boolean | null)[];
  score?: number; // 0..1
}

export interface Explanation {
  id: string;
  createdAt: string;
  concept: string;
  text: string;
  feedback?: {
    clarity: number; // 1..5
    strengths: string[];
    gaps: string[];
    followUp: string;
  };
}

export interface FinalReflection {
  summary: string;
  surprise: string;
  stillConfused: string;
  rating: 1 | 2 | 3 | 4 | 5;
  wantMore: boolean;
  completedAt: string;
}

export type Depth = 'curious' | 'committed' | 'obsessed';

export type LearningStyle = 'reading' | 'video' | 'hands-on' | 'audio' | 'mixed';

export interface Hole {
  id: string;
  topic: string;
  title: string;
  tagline: string;
  domain: Domain;
  tags: string[];
  catalogId?: string;
  createdAt: string;
  startDate: string;
  status: 'active' | 'completed' | 'abandoned';
  depth: Depth;
  style: LearningStyle;
  angle?: string; // the user's personal angle/question
  brief: Brief;
  days: Day[];
  questions: CuriosityQuestion[];
  quizzes: QuizAttempt[];
  explanations: Explanation[];
  recap?: string;
  final?: FinalReflection;
  source: 'ai' | 'offline';
  model?: string;
}

// ----- Interest profile / recommendation -----

export interface Profile {
  name: string;
  onboarded: boolean;
  /** 0 = stay close to what I like, 1 = surprise me constantly */
  adventurousness: number;
  domainAffinity: Partial<Record<Domain, number>>;
  tagAffinity: Record<string, number>;
  /** Signal history keyed by catalog/topic id. */
  topicSignals: Record<string, TopicSignal>;
  defaultMinutes: number;
  style: LearningStyle;
}

export interface TopicSignal {
  shown: number;
  liked?: boolean;
  dismissedAt?: string;
  savedAt?: string;
  startedAt?: string;
  rating?: number;
}

export interface CatalogTopic {
  id: string;
  title: string;
  hook: string;
  domain: Domain;
  tags: string[];
  concepts: string[];
  questions: string[];
  /** Search queries for kick-off material. */
  starters: string[];
}

export interface Suggestion {
  topic: CatalogTopic;
  bucket: 'alley' | 'hop' | 'wildcard' | 'thread' | 'ai';
  score: number;
  reason: string;
}

// ----- AI settings -----

export type ProviderKind = 'ollama' | 'openai' | 'anthropic' | 'offline';

export interface AISettings {
  provider: ProviderKind;
  ollama: { baseUrl: string; model: string };
  openai: { baseUrl: string; model: string; apiKey: string };
  anthropic: { apiKey: string; model: string; webSearch: boolean };
  temperature: number;
}

export interface UISettings {
  motion: 'full' | 'reduced';
  background: 'animated' | 'static';
  sounds: boolean;
}
