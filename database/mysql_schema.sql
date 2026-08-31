CREATE DATABASE IF NOT EXISTS studyroom;
USE studyroom;

CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  matricule VARCHAR(50) NOT NULL UNIQUE,
  promotion VARCHAR(100),
  filiere VARCHAR(100),
  classe VARCHAR(100),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  specialite VARCHAR(150),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  level VARCHAR(50),
  teacher_id INT,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

CREATE TABLE courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  teacher_id INT NOT NULL,
  class_id INT,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id),
  FOREIGN KEY (class_id) REFERENCES classes(id)
);

CREATE TABLE assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  type ENUM('devoir', 'interrogation', 'examen') NOT NULL,
  description TEXT,
  course_id INT NOT NULL,
  class_id INT NOT NULL,
  published_at DATETIME NOT NULL,
  due_date DATETIME,
  duration_minutes INT DEFAULT NULL,
  teacher_id INT NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id),
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

CREATE TABLE questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  question_text TEXT NOT NULL,
  option_a VARCHAR(255) NOT NULL,
  option_b VARCHAR(255) NOT NULL,
  option_c VARCHAR(255) NOT NULL,
  option_d VARCHAR(255) NOT NULL,
  correct_option ENUM('A','B','C','D') NOT NULL,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id)
);

CREATE TABLE submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  submitted_at DATETIME NOT NULL,
  status ENUM('brouillon', 'soumis', 'notee', 'validee') DEFAULT 'soumis',
  answers JSON,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  teacher_id INT NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  remark TEXT,
  published_at DATETIME NOT NULL,
  status ENUM('en_attente', 'publiee') DEFAULT 'en_attente',
  FOREIGN KEY (submission_id) REFERENCES submissions(id),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

INSERT INTO roles (name) VALUES ('admin'), ('student'), ('teacher');
