/// <reference types="vitest/globals" />
import {
  asAgentWriteMode,
  decideWriteAction,
  isHighRiskKind,
  isImportantKind,
} from './agent-write-mode';

describe('agent write mode', () => {
  it('defaults unknown values to confirm', () => {
    expect(asAgentWriteMode('full')).toBe('full');
    expect(asAgentWriteMode('nope')).toBe('confirm');
    expect(asAgentWriteMode(null)).toBe('confirm');
  });

  it('treats delete-like kinds as high risk', () => {
    expect(isHighRiskKind('delete_project')).toBe(true);
    expect(isHighRiskKind('delete_entity')).toBe(true);
    expect(isHighRiskKind('create_character')).toBe(false);
  });

  it('treats creating a world as important for semi-auto', () => {
    expect(isImportantKind('create_project')).toBe(true);
    expect(isImportantKind('update_entity')).toBe(false);
    expect(isImportantKind('create_character')).toBe(false);
  });

  it('asks on every write in confirm mode', () => {
    expect(decideWriteAction('confirm', ['create_character'])).toBe('ask');
    expect(decideWriteAction('confirm', ['update_entity'])).toBe('ask');
  });

  it('auto-applies routine writes in semi, asks for a new world', () => {
    expect(decideWriteAction('semi', ['create_character', 'create_location'])).toBe('auto');
    expect(decideWriteAction('semi', ['update_entity'])).toBe('auto');
    expect(decideWriteAction('semi', ['create_project'])).toBe('ask');
    expect(decideWriteAction('semi', ['create_project', 'create_character'])).toBe('ask');
  });

  it('holds writes as a plan until the user executes', () => {
    expect(decideWriteAction('plan', ['create_character'])).toBe('plan');
    expect(decideWriteAction('plan', ['create_project'])).toBe('plan');
  });

  it('auto-applies world writes in full, but still asks for deletes', () => {
    expect(decideWriteAction('full', ['create_character', 'update_entity'])).toBe('auto');
    expect(decideWriteAction('full', ['create_project'])).toBe('auto');
    expect(decideWriteAction('full', ['delete_project'])).toBe('ask');
  });
});
