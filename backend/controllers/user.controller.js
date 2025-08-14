// controllers/userController.js

const pool = require('../config/db');

// controllers/userController.js


const startTest = async (req, res) => {
  const { full_name, email } = req.body;

  if (!full_name || !email) {
    return res.status(400).json({ message: 'Full name and email are required' });
  }

  try {
    // Userni olish yoki yaratish
    let user = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
    if (!user) {
      user = (await pool.query(
        'INSERT INTO users (full_name, email, role) VALUES ($1, $2, $3) RETURNING *',
        [full_name, email, 'user']
      )).rows[0];
    }

    // Random test ID tanlash
    const test = (await pool.query('SELECT id FROM tests ORDER BY RANDOM() LIMIT 1')).rows[0];
    if (!test) return res.status(404).json({ message: 'No tests available' });

    // Test savollari va javoblarni bitta query bilan olish
    const questionsWithAnswers = (await pool.query(`
     SELECT 
        q.id AS question_id,
        q.question_text,
        q.correct_option,
        json_agg(
          json_build_object(
            'id', a.id,
            'option_label', a.option_label,
            'option_text', a.option_text
          )
        ) AS options
      FROM questions q
      LEFT JOIN answers a ON q.id = a.question_id
      WHERE q.test_id = $1
      GROUP BY q.id
    `, [test.id])).rows;

    res.json({
      user,
      testId: test.id,
      questions: questionsWithAnswers
    });

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