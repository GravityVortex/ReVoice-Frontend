import { describe, expect, it } from 'vitest';

import { splitSubtitlePayload } from './split';

function makeTranslateRow(overrides: Record<string, any> = {}) {
  return {
    id: '0001_00-00-00-000_00-00-04-000',
    seq: '1',
    start: '00:00:00,000',
    end: '00:00:04,000',
    txt: 'hello world',
    audio_url: 'adj_audio_time/0001_00-00-00-000_00-00-04-000.wav',
    audio_rev_ms: 111,
    vap_draft_audio_path: 'adj_audio_time_temp/0001.wav',
    vap_draft_duration: 4,
    vap_draft_txt: 'hello world',
    vap_tts_job_id: 'tts_1',
    vap_tts_request_key: 'tts_req_1',
    vap_tts_updated_at_ms: 222,
    vap_tr_job_id: 'tr_1',
    vap_tr_request_key: 'tr_req_1',
    vap_tr_updated_at_ms: 333,
    ...overrides,
  };
}

function makeSourceRow(overrides: Record<string, any> = {}) {
  return {
    id: '0001_00-00-00-000_00-00-04-000',
    seq: '1',
    start: '00:00:00,000',
    end: '00:00:04,000',
    txt: 'hello world',
    ...overrides,
  };
}

describe('splitSubtitlePayload', () => {
  it('splits translate and source arrays at the same index and reindexes seq', () => {
    const untouchedTranslate = makeTranslateRow({
      id: '0002_00-00-05-000_00-00-07-000',
      seq: '2',
      start: '00:00:05,000',
      end: '00:00:07,000',
      txt: 'tail',
    });
    const untouchedSource = makeSourceRow({
      id: '0002_00-00-05-000_00-00-07-000',
      seq: '2',
      start: '00:00:05,000',
      end: '00:00:07,000',
      txt: 'tail',
    });

    const out = splitSubtitlePayload({
      clipId: '0001_00-00-00-000_00-00-04-000',
      splitAtMs: 2000,
      effectiveConvertText: 'edited text',
      splitOperationId: 'split_op_1',
      nowMs: 1700000000000,
      translate: [makeTranslateRow(), untouchedTranslate],
      source: [makeSourceRow(), untouchedSource],
    });

    expect(out.translate).toHaveLength(3);
    expect(out.source).toHaveLength(3);
    expect(out.splitIndex).toBe(0);
    expect(out.translate[2]).toBe(untouchedTranslate);
    expect(out.source[2]).toBe(untouchedSource);
    expect(out.translate.map((row) => row.seq)).toEqual(['1', '2', '3']);
    expect(out.source.map((row) => row.seq)).toEqual(['1', '2', '3']);
    expect(out.translate[0].txt).toBe('edited text');
    expect(out.translate[1].txt).toBe('edited text');
  });

  it('clears translated voice fields and sets explicit split status', () => {
    const out = splitSubtitlePayload({
      clipId: '0001_00-00-00-000_00-00-04-000',
      splitAtMs: 2000,
      effectiveConvertText: 'same text',
      splitOperationId: 'split_op_1',
      nowMs: 1700000000000,
      translate: [makeTranslateRow()],
      source: [makeSourceRow()],
    });

    for (const row of out.translate) {
      expect(row.audio_url).toBe('');
      expect(row.audio_rev_ms).toBeUndefined();
      expect(row.vap_draft_audio_path).toBe('');
      expect(row.vap_draft_duration).toBeUndefined();
      expect(row.vap_tts_job_id).toBe('');
      expect(row.vap_tr_job_id).toBe('');
      expect(row.vap_voice_status).toBe('missing');
      expect(row.vap_needs_tts).toBe(true);
      expect(row.vap_split_parent_id).toBe('0001_00-00-00-000_00-00-04-000');
      expect(row.vap_tts_reference_subtitle_id).toBe('0001_00-00-00-000_00-00-04-000');
      expect(row.vap_split_operation_id).toBe('split_op_1');
    }
  });

  it('marks new source rows as fallback_vocal instead of generating source audio', () => {
    const out = splitSubtitlePayload({
      clipId: '0001_00-00-00-000_00-00-04-000',
      splitAtMs: 2000,
      effectiveConvertText: 'same text',
      splitOperationId: 'split_op_1',
      nowMs: 1700000000000,
      translate: [makeTranslateRow()],
      source: [makeSourceRow()],
    });

    for (const row of out.source) {
      expect(row.vap_source_mode).toBe('fallback_vocal');
      expect(row.vap_source_segment_missing).toBe(true);
      expect(row.vap_source_split_parent_id).toBe('0001_00-00-00-000_00-00-04-000');
      expect(row.vap_split_operation_id).toBe('split_op_1');
    }
  });
});
