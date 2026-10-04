import type { Action, Facts, Run } from './contracts';
export type LearningCase = 'L-01' | 'L-02' | 'L-03' | 'custom';
export type LearningRun = Run & {
  learningCase?: LearningCase;
  firstRecord?: {
    at: number;
    facts: Facts;
    factsRevision: number;
    recordRevision: number;
    assistance: string[];
  };
  decisions?: {
    action: Action;
    at: number;
    outcome: string;
    committed: boolean;
    ruleIds: string[];
    evidenceIds: string[];
    facts: Facts;
    factsRevision: number;
    recordRevision: number;
  }[];
  reasonReview?: { actorId: string; at: number; supported: boolean; note: string };
};
