import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SingleChoiceQuestion } from './questions/SingleChoiceQuestion';
import { MultipleChoiceQuestion } from './questions/MultipleChoiceQuestion';
import { TrueFalseQuestion } from './questions/TrueFalseQuestion';
import { ClozeQuestion } from './questions/ClozeQuestion';
import { NumericQuestion } from './questions/NumericQuestion';
import { MatchingQuestion } from './questions/MatchingQuestion';
import { OrderingQuestion } from './questions/OrderingQuestion';
import { ShortTextQuestion } from './questions/ShortTextQuestion';
import { EssayQuestion } from './questions/EssayQuestion';
import { QuestionRenderer } from './QuestionRenderer';

describe('Phase 6: Question Renderers (All 9 Types)', () => {
  it('renders SINGLE_CHOICE and captures option selection', () => {
    const onChange = vi.fn();
    const content = {
      options: [
        { id: 'opt-a', text: 'Option Alpha' },
        { id: 'opt-b', text: 'Option Beta' },
      ],
    };

    render(
      <SingleChoiceQuestion
        content={content}
        value={{ selectedOptionId: 'opt-a' }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Option Alpha')).toBeInTheDocument();
    expect(screen.getByText('Option Beta')).toBeInTheDocument();

    const radioB = screen.getByLabelText('Option Beta');
    fireEvent.click(radioB);
    expect(onChange).toHaveBeenCalledWith({ selectedOptionId: 'opt-b' });
  });

  it('renders MULTIPLE_CHOICE and toggles options', () => {
    const onChange = vi.fn();
    const content = {
      options: [
        { id: 'opt-1', text: 'First item' },
        { id: 'opt-2', text: 'Second item' },
      ],
    };

    render(
      <MultipleChoiceQuestion
        content={content}
        value={{ selectedOptionIds: ['opt-1'] }}
        onChange={onChange}
      />,
    );

    const check2 = screen.getByLabelText('Second item');
    fireEvent.click(check2);
    expect(onChange).toHaveBeenCalledWith({ selectedOptionIds: ['opt-1', 'opt-2'] });
  });

  it('renders TRUE_FALSE and captures binary selection', () => {
    const onChange = vi.fn();
    render(<TrueFalseQuestion value={{ selectedBoolean: true }} onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'True' })).toHaveClass('btn-primary');
    expect(screen.getByRole('button', { name: 'False' })).toHaveClass('btn-secondary');

    fireEvent.click(screen.getByRole('button', { name: 'False' }));
    expect(onChange).toHaveBeenCalledWith({ selectedBoolean: false });
  });

  it('renders CLOZE with blanks embedded in text flow', () => {
    const onChange = vi.fn();
    const content = {
      templateText: 'The capital of France is {{city}} and Germany is {{germany}}.',
      targetBlanks: [
        { blankKey: 'city', hint: 'city' },
        { blankKey: 'germany', hint: 'capital' },
      ],
    };

    render(
      <ClozeQuestion
        content={content}
        value={{ blanks: { city: 'Paris' } }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText(/The capital of France is/)).toBeInTheDocument();
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue('Paris');

    fireEvent.change(inputs[1], { target: { value: 'Berlin' } });
    expect(onChange).toHaveBeenCalledWith({
      blanks: { city: 'Paris', germany: 'Berlin' },
    });
  });

  it('renders NUMERIC and captures numerical values', () => {
    const onChange = vi.fn();
    render(
      <NumericQuestion
        content={{ unit: 'kg' }}
        value={{ submittedValue: 42.5 }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('kg')).toBeInTheDocument();
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(42.5);

    fireEvent.change(input, { target: { value: '99.9' } });
    expect(onChange).toHaveBeenCalledWith({ submittedValue: '99.9' });
  });

  it('renders MATCHING and pairs premises with target dropdowns', () => {
    const onChange = vi.fn();
    const content = {
      premises: [
        { id: 'p1', text: 'Premise One' },
        { id: 'p2', text: 'Premise Two' },
      ],
      targets: [
        { id: 't1', text: 'Target Alpha' },
        { id: 't2', text: 'Target Beta' },
      ],
    };

    render(
      <MatchingQuestion
        content={content}
        value={{ pairs: { p1: 't1' } }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Premise One')).toBeInTheDocument();
    expect(screen.getByText('Premise Two')).toBeInTheDocument();

    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toHaveValue('t1');

    fireEvent.change(selects[1], { target: { value: 't2' } });
    expect(onChange).toHaveBeenCalledWith({
      pairs: { p1: 't1', p2: 't2' },
    });
  });

  it('renders ORDERING and shifts sequence up and down', () => {
    const onChange = vi.fn();
    const content = {
      items: [
        { id: 'item-1', text: 'Step 1' },
        { id: 'item-2', text: 'Step 2' },
        { id: 'item-3', text: 'Step 3' },
      ],
    };

    render(
      <OrderingQuestion
        content={content}
        value={{ sequence: ['item-1', 'item-2', 'item-3'] }}
        onChange={onChange}
      />,
    );

    const downButtons = screen.getAllByTitle('Move down');
    fireEvent.click(downButtons[0]); // move Step 1 down
    expect(onChange).toHaveBeenCalledWith({
      sequence: ['item-2', 'item-1', 'item-3'],
    });
  });

  it('renders SHORT_TEXT with custom placeholder and value', () => {
    const onChange = vi.fn();
    render(
      <ShortTextQuestion
        content={{ placeholder: 'Enter single word' }}
        value={{ text: 'Atomic' }}
        onChange={onChange}
      />,
    );

    const input = screen.getByPlaceholderText('Enter single word');
    expect(input).toHaveValue('Atomic');

    fireEvent.change(input, { target: { value: 'Linearizable' } });
    expect(onChange).toHaveBeenCalledWith({ text: 'Linearizable' });
  });

  it('renders ESSAY and calculates word count dynamically', () => {
    const onChange = vi.fn();
    render(
      <EssayQuestion
        content={{ minWords: 10, maxWords: 50 }}
        value={{ text: 'One two three four five' }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText(/Words: 5/)).toBeInTheDocument();
    expect(screen.getByText(/Min: 10/)).toBeInTheDocument();
    expect(screen.getByText(/Max: 50/)).toBeInTheDocument();

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Six seven eight' } });
    expect(onChange).toHaveBeenCalledWith({ text: 'Six seven eight' });
  });

  it('renders QuestionRenderer dispatcher without leaking answerKey or rubrics', () => {
    const onChange = vi.fn();
    const item = {
      id: 'item-ref-1',
      questionVersionId: 'qv-1',
      type: 'SINGLE_CHOICE' as const,
      title: 'Security Question',
      prompt: 'Select the secure hashing algorithm.',
      content: {
        options: [
          { id: 'opt-sha', text: 'SHA-256' },
          { id: 'opt-md5', text: 'MD5' },
        ],
      },
      points: 5,
      orderIndex: 0,
      isRequired: true,
    };

    render(<QuestionRenderer item={item} value={null} onChange={onChange} />);

    expect(screen.getByText('Security Question')).toBeInTheDocument();
    expect(screen.getByText('Select the secure hashing algorithm.')).toBeInTheDocument();
    expect(screen.getByText('(5 pts)')).toBeInTheDocument();
    expect(screen.getByText('*Required')).toBeInTheDocument();
    expect(screen.getByText('SHA-256')).toBeInTheDocument();
    // Verify no answerKey or solution text leaked
    expect(screen.queryByText(/answerKey/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/correctOptionId/i)).not.toBeInTheDocument();
  });
});
