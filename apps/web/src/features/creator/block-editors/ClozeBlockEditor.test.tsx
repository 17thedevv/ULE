import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClozeBlockEditor } from './ClozeBlockEditor';
import { ClozeConfig } from '@ule/contracts';

describe('ClozeBlockEditor', () => {
  it('renders prompt, passage textarea, and insert blank button', () => {
    const onChange = vi.fn();
    render(<ClozeBlockEditor onChange={onChange} />);

    expect(screen.getByLabelText(/Activity Prompt/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Passage Text/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ Insert Blank at Cursor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Auto-detect Blanks/i })).toBeInTheDocument();
  });

  it('inserts blank placeholder into template text and adds to blanks list', () => {
    let latestConfig: ClozeConfig | null = null;
    const onChange = vi.fn((cfg: ClozeConfig) => {
      latestConfig = cfg;
    });

    render(<ClozeBlockEditor onChange={onChange} />);

    const insertBtn = screen.getByRole('button', { name: /\+ Insert Blank at Cursor/i });
    fireEvent.click(insertBtn);

    // Textarea should contain placeholder
    const textarea = screen.getByLabelText(/Passage Text/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('{{blank_1}}');
    expect(
      (latestConfig as ClozeConfig | null)?.targetBlanks.some(
        (b: { blankKey: string }) => b.blankKey === 'blank_1',
      ),
    ).toBe(true);
  });

  it('allows adding multiple accepted answer variants for a blank', () => {
    let latestConfig: ClozeConfig | null = null;
    const onChange = vi.fn((cfg: ClozeConfig) => {
      latestConfig = cfg;
    });

    const initialConfig: Partial<ClozeConfig> = {
      prompt: 'Complete the sentence.',
      templateText: 'The capital of France is {{blank_1}}.',
      targetBlanks: [{ id: 'b_1', blankKey: 'blank_1', hintText: '' }],
      answerKey: {
        blanks: { blank_1: ['Paris'] },
      },
    };

    render(<ClozeBlockEditor initialConfig={initialConfig} onChange={onChange} />);

    expect((latestConfig as ClozeConfig | null)?.answerKey.blanks['blank_1']).toEqual(['Paris']);

    // Add variant
    const addVariantBtn = screen.getByRole('button', { name: /\+ Add Variant/i });
    fireEvent.click(addVariantBtn);

    const variantInputs = screen.getAllByPlaceholderText(/Accepted variant/i);
    expect(variantInputs.length).toBe(2);

    fireEvent.change(variantInputs[1], { target: { value: 'paris' } });

    expect((latestConfig as ClozeConfig | null)?.answerKey.blanks['blank_1']).toEqual([
      'Paris',
      'paris',
    ]);
  });

  it('detects when placeholder in text is missing in blanks configuration', () => {
    let latestIsValid = false;
    const onChange = vi.fn((_, valid) => {
      latestIsValid = valid;
    });

    const initialConfig: Partial<ClozeConfig> = {
      prompt: 'Complete the sentence.',
      templateText: 'Valid text with {{blank_1}}.',
      targetBlanks: [{ id: 'b_1', blankKey: 'blank_1' }],
      answerKey: { blanks: { blank_1: ['Word'] } },
    };

    render(<ClozeBlockEditor initialConfig={initialConfig} onChange={onChange} />);
    expect(latestIsValid).toBe(true);

    // Add unconfigured placeholder into text
    fireEvent.change(screen.getByLabelText(/Passage Text/i), {
      target: { value: 'Valid text with {{blank_1}} and {{blank_unknown}}.' },
    });

    // Invalid because blank_unknown does not have a configured blank item
    expect(latestIsValid).toBe(false);

    // Auto-detect blanks fixes it by generating the blank entry
    const detectBtn = screen.getByRole('button', { name: /Auto-detect Blanks/i });
    fireEvent.click(detectBtn);

    expect(screen.getByDisplayValue('blank_unknown')).toBeInTheDocument();
  });
});
