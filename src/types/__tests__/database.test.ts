import { describe, it, expect } from 'vitest'
import { EDUCATION_LEVELS } from '../database'
import type { EducationLevel } from '../database'

describe('EDUCATION_LEVELS', () => {
  it('contains exactly 4 levels', () => {
    expect(EDUCATION_LEVELS).toHaveLength(4)
  })

  it('has correct values in order', () => {
    const values = EDUCATION_LEVELS.map((l) => l.value)
    expect(values).toEqual(['middle_school', 'high_school', 'undergraduate', 'graduate'])
  })

  it('has human-readable labels', () => {
    const labels = EDUCATION_LEVELS.map((l) => l.label)
    expect(labels).toEqual(['Middle School', 'High School', 'Undergraduate', 'Graduate'])
  })

  it('each entry has both value and label', () => {
    for (const level of EDUCATION_LEVELS) {
      expect(level.value).toBeTruthy()
      expect(level.label).toBeTruthy()
    }
  })

  it('values are valid EducationLevel types', () => {
    const validValues: EducationLevel[] = ['middle_school', 'high_school', 'undergraduate', 'graduate']
    for (const level of EDUCATION_LEVELS) {
      expect(validValues).toContain(level.value)
    }
  })

  it('has no duplicate values', () => {
    const values = EDUCATION_LEVELS.map((l) => l.value)
    expect(new Set(values).size).toBe(values.length)
  })
})
