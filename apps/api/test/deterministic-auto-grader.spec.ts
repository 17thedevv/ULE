import {
  DeterministicAutoGraderService,
  ExamSnapshotItem,
} from '../src/modules/assessments/evaluators/deterministic-auto-grader.service';

describe('DeterministicAutoGraderService Unit Tests', () => {
  let grader: DeterministicAutoGraderService;

  beforeEach(() => {
    grader = new DeterministicAutoGraderService();
  });

  describe('SINGLE_CHOICE grading', () => {
    const item: ExamSnapshotItem = {
      id: 'sc-item-1',
      questionVersionId: 'qv-sc-1',
      type: 'SINGLE_CHOICE',
      title: 'Capital of France',
      prompt: 'What is the capital of France?',
      content: {
        options: [
          { id: 'opt_paris', text: 'Paris' },
          { id: 'opt_london', text: 'London' },
        ],
      },
      answerKey: { correctOptionId: 'opt_paris' },
      points: 5.0,
    };

    it('awards full points when selectedOptionId matches correctOptionId', () => {
      const responses = new Map([
        [item.id, { selectedOptionId: 'opt_paris' }],
      ]);
      const summary = grader.evaluateAttempt([item], responses, 80);

      expect(summary.totalAwardedPoints).toBe(5.0);
      expect(summary.maxPossiblePoints).toBe(5.0);
      expect(summary.percentageScore).toBe(100);
      expect(summary.isPassing).toBe(true);
      expect(summary.aggregationStatus).toBe('FULLY_GRADED');

      const itemGrade = summary.itemGrades[0];
      expect(itemGrade.isCorrect).toBe(true);
      expect(itemGrade.awardedPoints).toBe(5.0);
      expect(itemGrade.isPendingHuman).toBe(false);
    });

    it('awards 0 points when selectedOptionId is incorrect', () => {
      const responses = new Map([
        [item.id, { selectedOptionId: 'opt_london' }],
      ]);
      const summary = grader.evaluateAttempt([item], responses);

      expect(summary.totalAwardedPoints).toBe(0);
      expect(summary.itemGrades[0].isCorrect).toBe(false);
      expect(summary.itemGrades[0].awardedPoints).toBe(0);
    });

    it('awards 0 points for unattempted single choice', () => {
      const responses = new Map<string, Record<string, unknown>>();
      const summary = grader.evaluateAttempt([item], responses);

      expect(summary.totalAwardedPoints).toBe(0);
      expect(summary.itemGrades[0].isCorrect).toBe(false);
      expect(summary.itemGrades[0].evaluationDetails.status).toBe('UNATTEMPTED');
    });
  });

  describe('MULTIPLE_CHOICE grading', () => {
    const item: ExamSnapshotItem = {
      id: 'mc-item-1',
      questionVersionId: 'qv-mc-1',
      type: 'MULTIPLE_CHOICE',
      title: 'Prime Numbers',
      prompt: 'Select all prime numbers below:',
      content: {
        options: [
          { id: 'opt_2', text: '2' },
          { id: 'opt_3', text: '3' },
          { id: 'opt_4', text: '4' },
          { id: 'opt_5', text: '5' },
        ],
      },
      answerKey: { correctOptionIds: ['opt_2', 'opt_3', 'opt_5'] },
      points: 10.0,
    };

    it('awards full points when all correct options and only correct options are selected', () => {
      const responses = new Map([
        [item.id, { selectedOptionIds: ['opt_5', 'opt_2', 'opt_3'] }],
      ]);
      const summary = grader.evaluateAttempt([item], responses);

      expect(summary.totalAwardedPoints).toBe(10.0);
      expect(summary.itemGrades[0].isCorrect).toBe(true);
    });

    it('awards 0 points on partial subset match', () => {
      const responses = new Map([
        [item.id, { selectedOptionIds: ['opt_2', 'opt_3'] }],
      ]);
      const summary = grader.evaluateAttempt([item], responses);

      expect(summary.totalAwardedPoints).toBe(0);
      expect(summary.itemGrades[0].isCorrect).toBe(false);
    });

    it('awards 0 points when extra incorrect option is included', () => {
      const responses = new Map([
        [item.id, { selectedOptionIds: ['opt_2', 'opt_3', 'opt_5', 'opt_4'] }],
      ]);
      const summary = grader.evaluateAttempt([item], responses);

      expect(summary.totalAwardedPoints).toBe(0);
      expect(summary.itemGrades[0].isCorrect).toBe(false);
    });
  });

  describe('TRUE_FALSE grading', () => {
    const item: ExamSnapshotItem = {
      id: 'tf-item-1',
      questionVersionId: 'qv-tf-1',
      type: 'TRUE_FALSE',
      title: 'Earth Shape',
      prompt: 'The Earth is an oblate spheroid.',
      content: {},
      answerKey: { correctValue: true },
      points: 2.0,
    };

    it('awards points when boolean value matches exactly', () => {
      const responses = new Map([
        [item.id, { selectedBoolean: true }],
      ]);
      const summary = grader.evaluateAttempt([item], responses);

      expect(summary.totalAwardedPoints).toBe(2.0);
      expect(summary.itemGrades[0].isCorrect).toBe(true);
    });

    it('awards 0 points when boolean value does not match', () => {
      const responses = new Map([
        [item.id, { selectedBoolean: false }],
      ]);
      const summary = grader.evaluateAttempt([item], responses);

      expect(summary.totalAwardedPoints).toBe(0);
      expect(summary.itemGrades[0].isCorrect).toBe(false);
    });
  });

  describe('CLOZE grading', () => {
    const item: ExamSnapshotItem = {
      id: 'cloze-item-1',
      questionVersionId: 'qv-cloze-1',
      type: 'CLOZE',
      title: 'Photosynthesis',
      prompt: 'Plants use [[sunlight]] and [[water]] to produce [[glucose]].',
      content: {
        targetBlanks: [
          { blankKey: 'sunlight' },
          { blankKey: 'water' },
          { blankKey: 'glucose' },
        ],
      },
      answerKey: {
        blanks: {
          sunlight: ['sunlight', 'solar energy', 'light'],
          water: ['water', 'H2O'],
          glucose: ['glucose', 'sugar'],
        },
      },
      points: 6.0,
    };

    it('awards points with case-insensitivity, unicode NFKC normalization, and whitespace trimming', () => {
      const responses = new Map([
        [
          item.id,
          {
            blanks: {
              sunlight: '  Solar Energy  ',
              water: 'h2o',
              glucose: 'GLUCOSE',
            },
          },
        ],
      ]);
      const summary = grader.evaluateAttempt([item], responses);

      expect(summary.totalAwardedPoints).toBe(6.0);
      expect(summary.itemGrades[0].isCorrect).toBe(true);
    });

    it('awards 0 points if even one blank is wrong or missing', () => {
      const responses = new Map([
        [
          item.id,
          {
            blanks: {
              sunlight: 'sunlight',
              water: 'beer', // wrong
              glucose: 'glucose',
            },
          },
        ],
      ]);
      const summary = grader.evaluateAttempt([item], responses);

      expect(summary.totalAwardedPoints).toBe(0);
      expect(summary.itemGrades[0].isCorrect).toBe(false);
      expect(summary.itemGrades[0].evaluationDetails.allBlanksCorrect).toBe(false);
    });
  });

  describe('NUMERIC grading', () => {
    const itemAbsolute: ExamSnapshotItem = {
      id: 'num-item-1',
      questionVersionId: 'qv-num-1',
      type: 'NUMERIC',
      title: 'Pi constant',
      prompt: 'Enter value of Pi to 2 decimal places:',
      content: {},
      answerKey: { correctValue: 3.14159, tolerance: 0.01, toleranceType: 'ABSOLUTE' },
      points: 4.0,
    };

    const itemPercent: ExamSnapshotItem = {
      id: 'num-item-2',
      questionVersionId: 'qv-num-2',
      type: 'NUMERIC',
      title: 'Resistor Resistance',
      prompt: 'Enter nominal resistance with 5% tolerance:',
      content: {},
      answerKey: { correctValue: 1000, tolerance: 5.0, toleranceType: 'PERCENT' },
      points: 4.0,
    };

    it('evaluates absolute tolerance within and exceeding bounds', () => {
      // Within tolerance (3.14 vs 3.14159 is diff 0.00159 <= 0.01)
      const resIn = new Map([[itemAbsolute.id, { submittedValue: 3.14 }]]);
      const summaryIn = grader.evaluateAttempt([itemAbsolute], resIn);
      expect(summaryIn.totalAwardedPoints).toBe(4.0);
      expect(summaryIn.itemGrades[0].isCorrect).toBe(true);

      // Exceeding tolerance (3.12 vs 3.14159 is diff 0.02159 > 0.01)
      const resOut = new Map([[itemAbsolute.id, { submittedValue: 3.12 }]]);
      const summaryOut = grader.evaluateAttempt([itemAbsolute], resOut);
      expect(summaryOut.totalAwardedPoints).toBe(0);
      expect(summaryOut.itemGrades[0].isCorrect).toBe(false);
    });

    it('evaluates percentage tolerance within and exceeding bounds', () => {
      // Within 5% (1040 vs 1000 is 4% diff <= 5%)
      const resIn = new Map([[itemPercent.id, { submittedValue: 1040 }]]);
      const summaryIn = grader.evaluateAttempt([itemPercent], resIn);
      expect(summaryIn.totalAwardedPoints).toBe(4.0);
      expect(summaryIn.itemGrades[0].isCorrect).toBe(true);

      // Exceeding 5% (1060 vs 1000 is 6% diff > 5%)
      const resOut = new Map([[itemPercent.id, { submittedValue: 1060 }]]);
      const summaryOut = grader.evaluateAttempt([itemPercent], resOut);
      expect(summaryOut.totalAwardedPoints).toBe(0);
      expect(summaryOut.itemGrades[0].isCorrect).toBe(false);
    });

    it('handles non-numeric or non-finite inputs gracefully without throwing', () => {
      const resNaN = new Map([[itemAbsolute.id, { submittedValue: 'not-a-number' }]]);
      const summaryNaN = grader.evaluateAttempt([itemAbsolute], resNaN);
      expect(summaryNaN.totalAwardedPoints).toBe(0);
      expect(summaryNaN.itemGrades[0].isCorrect).toBe(false);
    });

    it('rejects implicit coercion of null, empty string, boolean, or array to zero', () => {
      const zeroItem: ExamSnapshotItem = {
        id: 'num-zero-1',
        questionVersionId: 'qv-num-zero',
        type: 'NUMERIC',
        title: 'Zero Value',
        prompt: 'Enter value zero:',
        content: {},
        answerKey: { correctValue: 0, tolerance: 0, toleranceType: 'ABSOLUTE' },
        points: 5.0,
      };

      // null must NOT coerce to 0
      const resNull = new Map([[zeroItem.id, { submittedValue: null }]]);
      const sumNull = grader.evaluateAttempt([zeroItem], resNull);
      expect(sumNull.totalAwardedPoints).toBe(0);
      expect(sumNull.itemGrades[0].isCorrect).toBe(false);

      // empty string must NOT coerce to 0
      const resEmpty = new Map([[zeroItem.id, { submittedValue: '' }]]);
      const sumEmpty = grader.evaluateAttempt([zeroItem], resEmpty);
      expect(sumEmpty.totalAwardedPoints).toBe(0);
      expect(sumEmpty.itemGrades[0].isCorrect).toBe(false);

      // boolean false must NOT coerce to 0
      const resBool = new Map([[zeroItem.id, { submittedValue: false }]]);
      const sumBool = grader.evaluateAttempt([zeroItem], resBool);
      expect(sumBool.totalAwardedPoints).toBe(0);
      expect(sumBool.itemGrades[0].isCorrect).toBe(false);

      // empty array must NOT coerce to 0
      const resArr = new Map([[zeroItem.id, { submittedValue: [] }]]);
      const sumArr = grader.evaluateAttempt([zeroItem], resArr);
      expect(sumArr.totalAwardedPoints).toBe(0);
      expect(sumArr.itemGrades[0].isCorrect).toBe(false);

      // legitimate number 0 must be correct
      const resZero = new Map([[zeroItem.id, { submittedValue: 0 }]]);
      const sumZero = grader.evaluateAttempt([zeroItem], resZero);
      expect(sumZero.totalAwardedPoints).toBe(5.0);
      expect(sumZero.itemGrades[0].isCorrect).toBe(true);

      // legitimate string "0" must be correct
      const resStrZero = new Map([[zeroItem.id, { submittedValue: '0' }]]);
      const sumStrZero = grader.evaluateAttempt([zeroItem], resStrZero);
      expect(sumStrZero.totalAwardedPoints).toBe(5.0);
      expect(sumStrZero.itemGrades[0].isCorrect).toBe(true);
    });
  });

  describe('MATCHING grading', () => {
    const item: ExamSnapshotItem = {
      id: 'match-item-1',
      questionVersionId: 'qv-match-1',
      type: 'MATCHING',
      title: 'Country Capitals',
      prompt: 'Match country to capital:',
      content: {
        premises: [{ id: 'p_fr' }, { id: 'p_de' }, { id: 'p_jp' }],
        targets: [{ id: 't_paris' }, { id: 't_berlin' }, { id: 't_tokyo' }],
      },
      answerKey: {
        pairs: {
          p_fr: 't_paris',
          p_de: 't_berlin',
          p_jp: 't_tokyo',
        },
      },
      points: 6.0,
    };

    it('awards full points when all premise pairings match the answer key', () => {
      const responses = new Map([
        [
          item.id,
          {
            pairs: {
              p_fr: 't_paris',
              p_de: 't_berlin',
              p_jp: 't_tokyo',
            },
          },
        ],
      ]);
      const summary = grader.evaluateAttempt([item], responses);
      expect(summary.totalAwardedPoints).toBe(6.0);
      expect(summary.itemGrades[0].isCorrect).toBe(true);
    });

    it('awards 0 points when any pairing is mismatched or omitted', () => {
      const responses = new Map([
        [
          item.id,
          {
            pairs: {
              p_fr: 't_paris',
              p_de: 't_tokyo', // wrong
              p_jp: 't_berlin',
            },
          },
        ],
      ]);
      const summary = grader.evaluateAttempt([item], responses);
      expect(summary.totalAwardedPoints).toBe(0);
      expect(summary.itemGrades[0].isCorrect).toBe(false);
    });
  });

  describe('ORDERING grading', () => {
    const item: ExamSnapshotItem = {
      id: 'order-item-1',
      questionVersionId: 'qv-ord-1',
      type: 'ORDERING',
      title: 'Historical Events',
      prompt: 'Arrange events chronologically:',
      content: {
        items: [{ id: 'e_ww1' }, { id: 'e_ww2' }, { id: 'e_moon' }],
      },
      answerKey: {
        correctSequence: ['e_ww1', 'e_ww2', 'e_moon'],
      },
      points: 5.0,
    };

    it('awards points when sequence matches exactly', () => {
      const responses = new Map([
        [item.id, { sequence: ['e_ww1', 'e_ww2', 'e_moon'] }],
      ]);
      const summary = grader.evaluateAttempt([item], responses);
      expect(summary.totalAwardedPoints).toBe(5.0);
      expect(summary.itemGrades[0].isCorrect).toBe(true);
    });

    it('awards 0 points for inverted or partial sequence', () => {
      const responses = new Map([
        [item.id, { sequence: ['e_ww2', 'e_ww1', 'e_moon'] }],
      ]);
      const summary = grader.evaluateAttempt([item], responses);
      expect(summary.totalAwardedPoints).toBe(0);
      expect(summary.itemGrades[0].isCorrect).toBe(false);
    });
  });

  describe('ESSAY & SHORT_TEXT grading', () => {
    const essayItem: ExamSnapshotItem = {
      id: 'essay-item-1',
      questionVersionId: 'qv-essay-1',
      type: 'ESSAY',
      title: 'Ethics of Artificial Intelligence',
      prompt: 'Discuss ethical concerns of autonomous AI systems.',
      content: {},
      rubric: {
        criteria: [
          { id: 'crit_depth', title: 'Depth of analysis', maxPoints: 10 },
          { id: 'crit_sources', title: 'Source citations', maxPoints: 5 },
        ],
      },
      points: 15.0,
    };

    it('flags essay response as pending human review and preserves pending human points', () => {
      const responses = new Map([
        [essayItem.id, { textResponse: 'AI systems require rigorous guardrails...' }],
      ]);
      const summary = grader.evaluateAttempt([essayItem], responses);

      expect(summary.objectivePoints).toBe(0);
      expect(summary.pendingHumanPoints).toBe(15.0);
      expect(summary.maxPossiblePoints).toBe(15.0);
      expect(summary.aggregationStatus).toBe('PARTIAL_PENDING_HUMAN');

      const grade = summary.itemGrades[0];
      expect(grade.isPendingHuman).toBe(true);
      expect(grade.isCorrect).toBe(false);
      expect(grade.awardedPoints).toBe(0);
      expect(grade.evaluationDetails.status).toBe('PENDING_HUMAN_EVALUATION');
      expect(grade.evaluationDetails.rubricCriteriaCount).toBe(2);
    });
  });

  describe('Mixed Examination Evaluation with Passing Threshold', () => {
    const objectiveItem1: ExamSnapshotItem = {
      id: 'mix-sc-1',
      questionVersionId: 'qv-1',
      type: 'SINGLE_CHOICE',
      title: 'Q1',
      prompt: 'Q1',
      content: {},
      answerKey: { correctOptionId: 'opt_a' },
      points: 20.0,
    };

    const objectiveItem2: ExamSnapshotItem = {
      id: 'mix-tf-1',
      questionVersionId: 'qv-2',
      type: 'TRUE_FALSE',
      title: 'Q2',
      prompt: 'Q2',
      content: {},
      answerKey: { correctValue: true },
      points: 30.0,
    };

    const subjectiveItem: ExamSnapshotItem = {
      id: 'mix-essay-1',
      questionVersionId: 'qv-3',
      type: 'ESSAY',
      title: 'Q3',
      prompt: 'Q3',
      content: {},
      points: 50.0,
    };

    it('correctly aggregates points, calculates percentage, and determines status for mixed exams', () => {
      const responses = new Map([
        [objectiveItem1.id, { selectedOptionId: 'opt_a' }], // +20
        [objectiveItem2.id, { selectedBoolean: false }],   // +0 (wrong)
        [subjectiveItem.id, { textResponse: 'My essay response...' }], // pending human
      ]);

      const summary = grader.evaluateAttempt(
        [objectiveItem1, objectiveItem2, subjectiveItem],
        responses,
        70.0, // 70% passing score
      );

      expect(summary.objectivePoints).toBe(20.0);
      expect(summary.pendingHumanPoints).toBe(50.0);
      expect(summary.maxPossiblePoints).toBe(100.0);
      expect(summary.percentageScore).toBeNull();
      expect(summary.isPassing).toBeNull();
      expect(summary.aggregationStatus).toBe('PARTIAL_PENDING_HUMAN');
    });

    it('evaluates fully graded objective exams as COMPLETED and passing when score meets threshold', () => {
      const responses = new Map([
        [objectiveItem1.id, { selectedOptionId: 'opt_a' }], // +20
        [objectiveItem2.id, { selectedBoolean: true }],    // +30
      ]);

      const summary = grader.evaluateAttempt(
        [objectiveItem1, objectiveItem2],
        responses,
        80.0,
      );

      expect(summary.objectivePoints).toBe(50.0);
      expect(summary.pendingHumanPoints).toBe(0);
      expect(summary.maxPossiblePoints).toBe(50.0);
      expect(summary.percentageScore).toBe(100.0);
      expect(summary.isPassing).toBe(true);
      expect(summary.aggregationStatus).toBe('FULLY_GRADED');
    });
  });
});
