import { useState } from 'react'
import { isoDate, type ISODate } from '@/domain/types'
import { usePlanningStore } from '@/store/planningStore'
import { Button } from '@/ui/common/Button'
import { DateInput } from '@/ui/common/inputs'

export function HolidaysView() {
  const project = usePlanningStore((s) => s.project)
  const updateCalendar = usePlanningStore((s) => s.updateCalendar)

  const [newDate, setNewDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const holidays = project.calendar.holidays

  const setHolidays = (next: ISODate[]) => {
    const deduped = [...new Set(next)].sort() as ISODate[]
    updateCalendar({ holidays: deduped })
  }

  const addHoliday = (value: string) => {
    if (!value) {
      setError('Pick a date first.')
      return
    }
    const iso = isoDate(value)
    if (holidays.includes(iso)) {
      setError(`${value} is already a holiday.`)
      return
    }
    setError(null)
    setHolidays([...holidays, iso])
    setNewDate('')
  }

  const removeHoliday = (iso: ISODate) => {
    setHolidays(holidays.filter((h) => h !== iso))
  }

  const updateHoliday = (oldIso: ISODate, value: string) => {
    if (!value) return
    const iso = isoDate(value)
    if (iso === oldIso) return
    if (holidays.includes(iso)) {
      setError(`${value} is already a holiday.`)
      return
    }
    setError(null)
    setHolidays([...holidays.filter((h) => h !== oldIso), iso])
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold">Holidays</h2>
      </div>
      <p className="text-sm text-gray-600 mb-3">
        Free days are treated as non-working time across the whole project. They are highlighted in light red on the
        Gantt chart.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <DateInput
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          aria-label="New holiday date"
        />
        <Button variant="primary" size="sm" onClick={() => addHoliday(newDate)}>
          + Add holiday
        </Button>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>

      {holidays.length === 0 && (
        <div className="text-sm text-gray-500 italic">No holidays yet.</div>
      )}

      <div className="grid gap-2 max-w-lg">
        {holidays.map((h) => (
          <div key={h} className="border rounded bg-white flex items-center gap-2 px-3 py-2">
            <DateInput
              value={h}
              onChange={(e) => updateHoliday(h, e.target.value)}
              aria-label={`Holiday ${h}`}
            />
            <span className="text-sm text-gray-500">{formatWeekday(h)}</span>
            <div className="ml-auto">
              <Button variant="danger" size="sm" onClick={() => removeHoliday(h)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatWeekday(iso: ISODate): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'long' })
}
