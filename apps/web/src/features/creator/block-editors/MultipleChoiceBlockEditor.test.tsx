import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultipleChoiceBlockEditor } from './MultipleChoiceBlockEditor';
import { MultipleChoiceConfig } from '@ule/contracts';

describe('MultipleChoiceBlockEditor', () => {
  it('renders question prompt input and initial 2 choices', () => {
    const onChange = vi.fn();
    render(<MultipleChoiceBlockEditor onChange={onChange} />);

    expect(screen.getByLabelText(/Question Prompt/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Choice 1 text/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Choice 2 text/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ Add Option/i })).toBeInTheDocument();
  });

  it('allows adding and removing choices dynamically within 2-10 bounds', () => {
    const onChange = vi.fn();
    render(<MultipleChoiceBlockEditor onChange={onChange} />);

    const addBtn = screen.getByRole('button', { name: /\+ Add Option/i });
    fireEvent.click(addBtn);

    expect(screen.getByPlaceholderText(/Choice 3 text/i)).toBeInTheDocument();

    // Remove option 3
    const removeBtn = screen.getByLabelText(/Remove option 3/i);
    fireEvent.click(removeBtn);

    expect(screen.queryByPlaceholderText(/Choice 3 text/i)).not.toBeInTheDocument();
  });

  it('clears correctOptionId when the selected option is removed and does not silently default', () => {
    const initialConfig: Partial<MultipleChoiceConfig> = {
      question: 'What is 2 + 2?',
      options: [
        { id: 'opt_1', text: '3' },
        { id: 'opt_2', text: '4' },
        { id: 'opt_3', text: '5' },
      ],
      answerKey: { correctOptionId: 'opt_3' },
    };

    let latestConfig: MultipleChoiceConfig | null = null;
    let latestIsValid = false;
    const onChange = vi.fn((cfg: MultipleChoiceConfig, valid: boolean) => {
      latestConfig = cfg;
      latestIsValid = valid;
    });

    render(<MultipleChoiceBlockEditor initialConfig={initialConfig} onChange={onChange} />);

    // Initially valid with opt_3 as correct
    expect((latestConfig as MultipleChoiceConfig | null)?.answerKey.correctOptionId).toBe('opt_3');
    expect(latestIsValid).toBe(true);

    // Remove opt_3
    const removeOpt3Btn = screen.getByLabelText(/Remove option 3/i);
    fireEvent.click(removeOpt3Btn);

    // After removing opt_3, correctOptionId MUST be cleared, not defaulted to opt_1!
    expect((latestConfig as MultipleChoiceConfig | null)?.answerKey.correctOptionId).toBe('');
    expect(latestIsValid).toBe(false);
    expect(screen.getByText(/Please select which choice is the correct answer/i)).toBeInTheDocument();

    // Selecting opt_2 marks it valid again
    const radioOpt2 = screen.getByLabelText(/Mark option 2 as correct/i);
    fireEvent.click(radioOpt2);

    expect((latestConfig as MultipleChoiceConfig | null)?.answerKey.correctOptionId).toBe('opt_2');
    expect(latestIsValid).toBe(true);
  });

  it('validates minimum question length and option text', () => {
    let latestIsValid = false;
    const onChange = vi.fn((_, valid) => {
      latestIsValid = valid;
    });

    render(<MultipleChoiceBlockEditor onChange={onChange} />);

    // Initially empty -> invalid
    expect(latestIsValid).toBe(false);

    // Type 2 characters in question
    fireEvent.change(screen.getByLabelText(/Question Prompt/i), {
      target: { value: 'Hi' },
    });
    expect(screen.getByText(/Must be at least 3 characters/i)).toBeInTheDocument();
    expect(latestIsValid).toBe(false);

    // Type valid question
    fireEvent.change(screen.getByLabelText(/Question Prompt/i), {
      target: { value: 'What is ULE?' },
    });
    // Still invalid because choices are empty and no correct choice chosen
    expect(latestIsValid).toBe(false);

    // Fill choices
    fireEvent.change(screen.getByPlaceholderText(/Choice 1 text/i), {
      target: { value: 'Universal Learning Engine' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Choice 2 text/i), {
      target: { value: 'Unified Logic Editor' },
    });

    // Select option 1
    fireEvent.click(screen.getByLabelText(/Mark option 1 as correct/i));

    // Now valid!
    expect(latestIsValid).toBe(true);
  });

  it('requires hint text when hints are enabled', () => {
    let latestIsValid = false;
    const onChange = vi.fn((_, valid) => {
      latestIsValid = valid;
    });

    const initialConfig: Partial<MultipleChoiceConfig> = {
      question: 'Valid question text',
      options: [
        { id: 'opt_1', text: 'Option A' },
        { id: 'opt_2', text: 'Option B' },
      ],
      answerKey: { correctOptionId: 'opt_1' },
      allowHints: false,
    };

    render(<MultipleChoiceBlockEditor initialConfig={initialConfig} onChange={onChange} />);
    expect(latestIsValid).toBe(true);

    // Enable hints
    fireEvent.click(screen.getByLabelText(/Allow Hint on this Question/i));

    // Initially invalid because hintText is empty
    expect(latestIsValid).toBe(false);

    // Enter hint text
    fireEvent.change(screen.getByPlaceholderText(/Hint text delivered on learner request/i), {
      target: { value: 'Consider the first letter of each word.' },
    });

    expect(latestIsValid).toBe(true);
  });
});
