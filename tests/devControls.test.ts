import { describe, expect, it } from 'vitest';
import { commandForKey } from '../src/ui/devControls';

describe('commandForKey', () => {
  it('maps 1-5 to states in contract order', () => {
    expect(commandForKey('1')).toEqual({ kind: 'force', state: 'idle' });
    expect(commandForKey('2')).toEqual({ kind: 'force', state: 'working' });
    expect(commandForKey('3')).toEqual({ kind: 'force', state: 'error' });
    expect(commandForKey('4')).toEqual({ kind: 'force', state: 'celebrating' });
    expect(commandForKey('5')).toEqual({ kind: 'force', state: 'offline' });
  });

  it('maps 0 to demo mode', () => {
    expect(commandForKey('0')).toEqual({ kind: 'demo' });
  });

  it('ignores other keys', () => {
    for (const k of ['6', '9', 'a', ' ', 'Enter', '1.5', '01', '']) expect(commandForKey(k)).toBeNull();
  });
});
