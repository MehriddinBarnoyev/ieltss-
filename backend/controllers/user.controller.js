// controllers/userController.js

const pool = require('../config/db');

const startTest = async (req, res) => {
  const { full_name, email } = req.body;
  try {
    // Validate required fields
    if (!full_name || !email) {
      return res.status(400).json({ message: 'Full name and email are required' });
    }

    // Check if user exists, create if not
    let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!user.rows[0]) {
      user = await pool.query(
        'INSERT INTO users (full_name, email, role) VALUES ($1, $2, $3) RETURNING *',
        [full_name, email, 'user']
      );
    }

    // Fetch all test IDs
    const testResult = await pool.query('SELECT id FROM tests');
    const testIds = testResult.rows.map(row => row.id);

    // Check if any tests exist
    if (testIds.length === 0) {
      return res.status(404).json({ message: 'No tests available' });
    }

    // Randomly select one test ID
    const randomIndex = Math.floor(Math.random() * testIds.length);
    const selectedTestId = testIds[randomIndex];

    // Fetch all questions for the randomly selected test
    const questions = await pool.query(
      'SELECT q.*, m.media_type, m.media_url FROM questions q LEFT JOIN question_media m ON q.id = m.question_id WHERE q.test_id = $1',
      [selectedTestId]
    );

    // Fetch all answers for the questions
    const answersResult = await pool.query(
      'SELECT * FROM answers WHERE question_id IN (SELECT id FROM questions WHERE test_id = $1)',
      [selectedTestId]
    );

    // Group answers by question_id for easier frontend handling
    const answers = questions.rows.map(q => ({
      question_id: q.id,
      options: answersResult.rows.filter(a => a.question_id === q.id)
    }));

    // Return the user, selected test ID, questions, and answers
    res.json({ user: user.rows[0], testId: selectedTestId, questions: questions.rows, answers });
  } catch (error) {
    console.error('Error starting test:', error);
    res.status(500).json({ message: 'Error starting test', error });
  }
};

const submitTest = async (req, res) => {
  const { user_id, answers } = req.body;
  const testId = req.params.id;
  try {
    // Validate test exists
    const testCheck = await pool.query('SELECT id FROM tests WHERE id = $1', [testId]);
    if (testCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Test not found' });
    }

    await pool.query('BEGIN');
    let score = 0;
    const total_questions = answers.length;

    // Insert attempt
    const attempt = await pool.query(
      'INSERT INTO attempts (user_id, test_id, score, total_questions, percentage) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [user_id, testId, 0, total_questions, 0]
    );
    const attemptId = attempt.rows[0].id;

    for (const answer of answers) {
      const question = await pool.query('SELECT correct_option FROM questions WHERE id = $1 AND test_id = $2', [answer.question_id, testId]);
      if (question.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid question for this test' });
      }
      const isCorrect = question.rows[0].correct_option === answer.selected_option;
      if (isCorrect) score++;
      await pool.query(
        'INSERT INTO attempt_answers (attempt_id, question_id, selected_option, is_correct) VALUES ($1, $2, $3, $4)',
        [attemptId, answer.question_id, answer.selected_option, isCorrect]
      );
    }

    const percentage = (score / total_questions) * 100;
    await pool.query('UPDATE attempts SET score = $1, percentage = $2 WHERE id = $3', [score, percentage, attemptId]);
    await pool.query('COMMIT');
    res.json({ attemptId, score, total_questions, percentage });
  } catch (error) {
    await pool.query('ROLLBACK');
    res.status(500).json({ message: 'Error submitting test', error });
  }
};

const submitFeedback = async (req, res) => {
  const { attempt_id, feedback_text } = req.body;
  const testId = req.params.id;
  try {
    // Validate attempt belongs to the test
    const attemptCheck = await pool.query(
      `SELECT 1 FROM attempts WHERE id = $1 AND test_id = $2 LIMIT 1`,
      [attempt_id, testId]
    );
    if (attemptCheck.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid attempt for this test' });
    }

    await pool.query(
      'INSERT INTO feedback (attempt_id, feedback_text) VALUES ($1, $2)',
      [attempt_id, feedback_text]
    );
    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error submitting feedback', error });
  }
};

const getAllTestsId = async (req, res) => {
  try {
    const tests = await pool.query('SELECT id FROM tests');
    res.json(tests.rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tests', error });
  }
};

module.exports = { startTest, submitTest, submitFeedback, getAllTestsId };