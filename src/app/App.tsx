import { Routes, Route } from 'react-router-dom'
import Home from '../pages/Home'
import Quiz from '../pages/Quiz'
import Results from '../pages/Results'
import AdminLogin from '../pages/admin/Login'
import AdminDashboard from '../pages/admin/Dashboard'
import AdminCourses from '../pages/admin/Courses'
import AdminExamsList from '../pages/admin/ExamsList'
import AdminExams from '../pages/admin/Exams'
import AdminQuestions from '../pages/admin/Questions'
import AdminImport from '../pages/admin/Import'
import AdminUsers from '../pages/admin/Users'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/quiz/:examId" element={<Quiz />} />
      <Route path="/results" element={<Results />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/courses" element={<AdminCourses />} />
      <Route path="/admin/exams" element={<AdminExamsList />} />
      <Route path="/admin/courses/:courseId/exams" element={<AdminExams />} />
      <Route path="/admin/exams/:examId/questions" element={<AdminQuestions />} />
      <Route path="/admin/import" element={<AdminImport />} />
      <Route path="/admin/users" element={<AdminUsers />} />
    </Routes>
  )
}

export default App
