import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Toaster } from './components/feedback'
import { FullLoader } from './components/ui'
import { syncServerTime } from './lib/time'
import Home from './pages/Home'
import Book from './pages/Book'
import Booking from './pages/Booking'

const StaffLogin = lazy(() => import('./pages/staff/Login'))
const StaffHome = lazy(() => import('./pages/staff/StaffHome'))
const Events = lazy(() => import('./pages/staff/Events'))
const Seats = lazy(() => import('./pages/staff/Seats'))
const Bookings = lazy(() => import('./pages/staff/Bookings'))
const Students = lazy(() => import('./pages/staff/Students'))
const Scanner = lazy(() => import('./pages/staff/Scanner'))
const Live = lazy(() => import('./pages/staff/Live'))
const Analytics = lazy(() => import('./pages/staff/Analytics'))
const Team = lazy(() => import('./pages/staff/Team'))

export default function App() {
  useEffect(() => {
    void syncServerTime()
    const t = window.setInterval(() => void syncServerTime(), 5 * 60 * 1000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <>
      <Suspense fallback={<FullLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/events" element={<Home />} />
          <Route path="/event/:id" element={<Book />} />
          <Route path="/booking" element={<Booking />} />
          <Route path="/status" element={<Booking />} />

          <Route path="/staff/login" element={<StaffLogin />} />
          <Route path="/staff" element={<StaffHome />} />
          <Route path="/staff/events" element={<Events />} />
          <Route path="/staff/events/:id/seats" element={<Seats />} />
          <Route path="/staff/bookings" element={<Bookings />} />
          <Route path="/staff/students" element={<Students />} />
          <Route path="/staff/scanner" element={<Scanner />} />
          <Route path="/staff/live" element={<Live />} />
          <Route path="/staff/analytics" element={<Analytics />} />
          <Route path="/staff/team" element={<Team />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      <Toaster />
    </>
  )
}
