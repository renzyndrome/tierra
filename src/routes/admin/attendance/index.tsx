// Admin — Service Attendance (standalone page). The management surface lives in
// the shared AttendanceManager component, which the admin dashboard also embeds
// as its "Attendance" tab.

import { createFileRoute } from '@tanstack/react-router'
import { AdminRoute } from '../../../components/ProtectedRoute'
import { AttendanceManager } from '../../../components/AttendanceManager'

export const Route = createFileRoute('/admin/attendance/')({
  component: () => (
    <AdminRoute requiredPermissions={['registration.read']}>
      <AttendanceManager />
    </AdminRoute>
  ),
})
