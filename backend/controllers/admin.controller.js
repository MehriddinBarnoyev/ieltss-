const pool = require('../config/db');


const createTest = async (req, res) => {
  const { name, description, questions } = req.body;
  if (!name || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: 'Name and questions array are required and questions cannot be empty' });
  }

  try {
    await pool.query('BEGIN');

    // Insert test
    const testResult = await pool.query(
      'INSERT INTO tests (name, description, created_by) VALUES ($1, $2, $3) RETURNING id',
      [name, description, req.user.id]
    );
    const testId = testResult.rows[0].id;

    const createdQuestionIds = [];

    for (const { question_text, correct_option, options, media } of questions) {
      // Validate input
      if (!question_text || !correct_option || !['A', 'B', 'C', 'D'].includes(correct_option)) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ message: 'Invalid question data: question_text and valid correct_option (A, B, C, D) are required' });
      }
      if (!Array.isArray(options) || options.length !== 4 || !options.every(opt => ['A', 'B', 'C', 'D'].includes(opt.label) && opt.text)) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ message: 'Each question must have exactly 4 options with valid labels (A, B, C, D) and text' });
      }

      // Insert question
      const questionResult = await pool.query(
        'INSERT INTO questions (test_id, question_text, correct_option) VALUES ($1, $2, $3) RETURNING id',
        [testId, question_text, correct_option]
      );
      const questionId = questionResult.rows[0].id;
      createdQuestionIds.push(questionId);

      // Insert options
      for (const option of options) {
        await pool.query(
          'INSERT INTO answers (question_id, option_label, option_text) VALUES ($1, $2, $3)',
          [questionId, option.label, option.text]
        );
      }

      // Insert media (if provided)
      if (media && media.type && media.url && ['image', 'audio'].includes(media.type)) {
        await pool.query(
          'INSERT INTO question_media (question_id, media_type, media_url) VALUES ($1, $2, $3)',
          [questionId, media.type, media.url]
        );
      }
    }

    await pool.query('COMMIT');
    res.status(201).json({ message: 'Test created successfully', testId, questionIds: createdQuestionIds });
  } catch (error) {
    await pool.query('ROLLBACK');
    res.status(500).json({ message: 'Error creating test', error });
  }
};

const editTest = async (req, res) => {
  const { name, description, questions } = req.body;
  const testId = req.params.id;
  try {
    // Check ownership
    const ownership = await pool.query('SELECT created_by FROM tests WHERE id = $1', [testId]);
    if (ownership.rows.length === 0 || ownership.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to edit this test' });
    }

    await pool.query('BEGIN');

    // Update test
    await pool.query(
      'UPDATE tests SET name = $1, description = $2 WHERE id = $3',
      [name, description, testId]
    );

    // Delete old questions, answers, and media (cascades)
    await pool.query('DELETE FROM questions WHERE test_id = $1', [testId]);

    // Insert new questions
    const createdQuestionIds = [];
    for (const { question_text, correct_option, options, media } of questions || []) {
      const questionResult = await pool.query(
        'INSERT INTO questions (test_id, question_text, correct_option) VALUES ($1, $2, $3) RETURNING id',
        [testId, question_text, correct_option]
      );
      const questionId = questionResult.rows[0].id;
      createdQuestionIds.push(questionId);

      for (const option of options) {
        await pool.query(
          'INSERT INTO answers (question_id, option_label, option_text) VALUES ($1, $2, $3)',
          [questionId, option.label, option.text]
        );
      }

      if (media) {
        await pool.query(
          'INSERT INTO question_media (question_id, media_type, media_url) VALUES ($1, $2, $3)',
          [questionId, media.type, media.url]
        );
      }
    }

    await pool.query('COMMIT');
    res.json({ message: 'Test updated successfully', questionIds: createdQuestionIds });
  } catch (error) {
    await pool.query('ROLLBACK');
    res.status(500).json({ message: 'Error updating test', error });
  }
};

const deleteTest = async (req, res) => {
  const testId = req.params.id;
  try {
    // Check ownership
    const ownership = await pool.query('SELECT created_by FROM tests WHERE id = $1', [testId]);
    if (ownership.rows.length === 0 || ownership.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to delete this test' });
    }

    // Delete test (cascades to questions, answers, media, attempts, etc.)
    await pool.query('DELETE FROM tests WHERE id = $1', [testId]);
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting test', error });
  }
};

const getTestResults = async (req, res) => {
  const testId = req.params.id;
  try {
    // Check ownership
    const ownership = await pool.query('SELECT created_by FROM tests WHERE id = $1', [testId]);
    if (ownership.rows.length === 0 || ownership.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to view results for this test' });
    }

    const results = await pool.query(
      `SELECT 
        a.id AS attempt_id, 
        a.score, 
        a.total_questions, 
        a.percentage, 
        a.created_at AS attempt_date,
        u.id AS user_id,
        u.full_name,
        u.email
      FROM attempts a
      JOIN users u ON a.user_id = u.id
      WHERE a.test_id = $1`,
      [testId]
    );
    res.json(results.rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching results', error });
  }
};

const getTestFeedback = async (req, res) => {
  const testId = req.params.id;
  try {
    // Check ownership
    const ownership = await pool.query('SELECT created_by FROM tests WHERE id = $1', [testId]);
    if (ownership.rows.length === 0 || ownership.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to view feedback for this test' });
    }

    const feedback = await pool.query(
      `SELECT 
        f.id AS feedback_id,
        f.feedback_text,
        f.created_at AS feedback_date,
        a.id AS attempt_id,
        u.full_name,
        u.email
      FROM feedback f
      JOIN attempts a ON f.attempt_id = a.id
      JOIN users u ON a.user_id = u.id
      WHERE a.test_id = $1`,
      [testId]
    );
    res.json(feedback.rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching feedback', error });
  }
};

const getAllResults = async (req, res) =>{
  try {
    const results = await pool.query(
      `SELECT 
        a.id AS attempt_id, 
        a.score, 
        a.total_questions, 
        a.percentage, 
        a.created_at AS attempt_date,
        u.id AS user_id,
        u.full_name,
        u.email,
        t.name AS test_name
      FROM attempts a
      JOIN users u ON a.user_id = u.id
      JOIN tests t ON a.test_id = t.id`
    );
    res.json(results.rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching all results', error });
  }
}

module.exports = { createTest, editTest, deleteTest, getTestResults, getTestFeedback, getAllResults };