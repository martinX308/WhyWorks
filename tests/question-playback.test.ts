import { describe, it, expect, vi } from 'vitest';
import { QuestionPlayback } from '../src/domain/question-playback';
describe('clientseitiger Sprech-Nachweis', () => {
  it('zählt reinen Agententext nicht; Abschluss braucht Beginn und Ende der Ausgabe', () => {
    const emit = vi.fn(),
      p = new QuestionPlayback(emit);
    p.message('Warum?');
    p.mode('listening');
    expect(emit).not.toHaveBeenCalled();
    p.mode('speaking');
    expect(emit).not.toHaveBeenCalled();
    p.mode('listening');
    expect(emit).toHaveBeenCalledExactlyOnceWith('completed', 'Warum?');
    p.mode('listening');
    p.message('Warum?');
    expect(emit).toHaveBeenCalledTimes(1);
  });
  it('verknüpft spät gelieferten Text, behandelt Barge-in konservativ und zählt keinen leeren Turn', () => {
    const emit = vi.fn(),
      p = new QuestionPlayback(emit);
    p.mode('speaking');
    p.interrupt();
    p.mode('listening');
    expect(emit).not.toHaveBeenCalled();
    p.message('Warum?');
    expect(emit).toHaveBeenCalledExactlyOnceWith('interrupted', 'Warum?');
    const completed = vi.fn(),
      late = new QuestionPlayback(completed);
    late.mode('speaking');
    late.mode('listening');
    late.message('Wieso?');
    expect(completed).toHaveBeenCalledExactlyOnceWith('completed', 'Wieso?');
  });
  it('zieht den Abschluss bei verspätetem Interruption-Signal zurück', () => {
    const emit = vi.fn(),
      p = new QuestionPlayback(emit);
    p.message('Warum?');
    p.mode('speaking');
    p.mode('listening');
    p.interrupt();
    expect(emit.mock.calls).toEqual([
      ['completed', 'Warum?'],
      ['interrupted', 'Warum?'],
    ]);
    p.interrupt();
    expect(emit).toHaveBeenCalledTimes(2);
  });
});
