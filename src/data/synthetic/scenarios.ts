import type { AdmissionInput, DocumentType } from '@/core/domain/types';
import type { DecisionStatus } from '@/core/domain/case-status';

export interface ScenarioFollowUp {
  id: string;
  label: string;
  description: string;
  expectedStatusAfter: DecisionStatus;
  evidence: {
    documentType: DocumentType;
    title: string;
    content: string;
    submittedBy: string;
    metadata?: Record<string, unknown>;
  };
}

export interface DemoScenario {
  id: string;
  code: 'GREEN' | 'YELLOW' | 'RED' | 'EXTRA';
  title: string;
  /** What the evaluator should understand from running this. */
  narrative: string;
  expectedStatus: DecisionStatus;
  expectedRequiresHuman: boolean;
  admission: AdmissionInput;
  followUps: ScenarioFollowUp[];
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  // -------------------------------------------------------------------------
  {
    id: 'green-verified',
    code: 'GREEN',
    title: 'Todo en regla: verificación automática en segundos',
    narrative:
      'Póliza vigente, hospital en red, documentación completa y sin antecedentes relacionados. El agente verifica la cobertura y notifica a admisiones y al gestor de casos en segundos.',
    expectedStatus: 'VERIFIED',
    expectedRequiresHuman: false,
    admission: {
      hospitalCode: 'HOSP-PTY-01',
      patientNationalId: '8-888-1111',
      policyNumber: 'POL-1001',
      admissionReason: 'Laceración profunda en antebrazo izquierdo por accidente doméstico. Sangrado controlado.',
      admissionReasonCode: 'S51.8',
      triageLevel: 'YELLOW',
      estimatedCost: 950,
      scenarioId: 'green-verified',
      attachedDocuments: [
        {
          documentType: 'ADMISSION_FORM',
          title: 'Formulario de ingreso a emergencias',
          content:
            'Ingreso 22:10. Paciente consciente, orientada. Motivo: laceración en antebrazo izquierdo de 6 cm por vidrio. Signos vitales estables. TA 118/76, FC 82, SatO2 98%.',
        },
        {
          documentType: 'PATIENT_ID',
          title: 'Documento de identidad verificado',
          content: 'Cédula 8-888-1111 verificada presencialmente por admisiones.',
        },
        {
          documentType: 'TRIAGE_NOTE',
          title: 'Nota de triaje',
          content: 'Triaje amarillo. Herida con bordes limpios, requiere sutura. Sin compromiso neurovascular.',
        },
      ],
    },
    followUps: [],
  },

  // -------------------------------------------------------------------------
  {
    id: 'yellow-documents-required',
    code: 'YELLOW',
    title: 'Falta documentación: el sistema dice exactamente cuál',
    narrative:
      'Póliza vigente y cobertura potencialmente válida, pero el costo estimado y el nivel de triaje exigen documentos que el hospital no envió. El agente dice exactamente qué falta y por qué. Al recibirlos, el caso se reevalúa solo.',
    expectedStatus: 'DOCUMENTS_REQUIRED',
    expectedRequiresHuman: false,
    admission: {
      hospitalCode: 'HOSP-PTY-02',
      patientNationalId: '8-777-2222',
      policyNumber: 'POL-2002',
      admissionReason: 'Dolor abdominal agudo en fosa ilíaca derecha de 8 horas de evolución. Sospecha de apendicitis aguda.',
      admissionReasonCode: 'R10.3',
      triageLevel: 'ORANGE',
      estimatedCost: 6800,
      scenarioId: 'yellow-documents-required',
      attachedDocuments: [
        {
          documentType: 'ADMISSION_FORM',
          title: 'Formulario de ingreso a emergencias',
          content:
            'Ingreso 03:40. Paciente masculino 30 años. Dolor abdominal migratorio. TA 126/80, FC 96, T 38.1 °C. Blumberg positivo.',
        },
        {
          documentType: 'PATIENT_ID',
          title: 'Documento de identidad verificado',
          content: 'Cédula 8-777-2222 verificada presencialmente por admisiones.',
        },
      ],
    },
    followUps: [
      {
        id: 'yellow-add-medical-report',
        label: 'Adjuntar informe médico',
        description: 'El hospital envía el informe médico de emergencias.',
        expectedStatusAfter: 'DOCUMENTS_REQUIRED',
        evidence: {
          documentType: 'MEDICAL_REPORT',
          title: 'Informe médico de emergencias',
          content:
            'Paciente de 30 años con cuadro compatible con apendicitis aguda no complicada. Leucocitosis 14,200. Ecografía abdominal: apéndice de 9 mm no compresible. Se indica apendicectomía laparoscópica de urgencia.',
          submittedBy: 'hospital:HOSP-PTY-02',
        },
      },
      {
        id: 'yellow-add-cost-estimate',
        label: 'Adjuntar estimado de costos',
        description: 'Admisiones envía el estimado de costos requerido por el monto del caso.',
        expectedStatusAfter: 'VERIFIED',
        evidence: {
          documentType: 'COST_ESTIMATE',
          title: 'Estimado de costos del procedimiento',
          content:
            'Apendicectomía laparoscópica, 1 noche de hospitalización, honorarios quirúrgicos y anestesia. Total estimado B/. 6,800.00.',
          submittedBy: 'hospital:HOSP-PTY-02',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'red-human-review',
    code: 'RED',
    title: 'Posible preexistencia: la decisión la toma una persona',
    narrative:
      'Póliza vigente y documentación completa, pero existe un antecedente registrado ANTES del inicio de la póliza que la tabla clínica marca como potencialmente relacionado con el motivo de ingreso. El sistema no decide: escala a revisión humana mostrando evidencia, motivo, incertidumbre y acción recomendada. La atención de emergencia nunca se detiene.',
    expectedStatus: 'HUMAN_REVIEW',
    expectedRequiresHuman: true,
    admission: {
      hospitalCode: 'HOSP-PTY-01',
      patientNationalId: '8-666-3333',
      policyNumber: 'POL-3003',
      admissionReason: 'Dolor torácico opresivo de 40 minutos irradiado a brazo izquierdo, con diaforesis.',
      admissionReasonCode: 'R07.9',
      triageLevel: 'RED',
      estimatedCost: 12400,
      scenarioId: 'red-human-review',
      attachedDocuments: [
        {
          documentType: 'ADMISSION_FORM',
          title: 'Formulario de ingreso a emergencias',
          content:
            'Ingreso 19:05 por sala de shock. Paciente femenina 54 años. Dolor torácico opresivo. TA 148/92, FC 104, SatO2 96%. Se activa protocolo de dolor torácico.',
        },
        {
          documentType: 'PATIENT_ID',
          title: 'Documento de identidad verificado',
          content: 'Cédula 8-666-3333 verificada presencialmente por admisiones.',
        },
        {
          documentType: 'TRIAGE_NOTE',
          title: 'Nota de triaje',
          content: 'Triaje rojo. Atención inmediata. ECG de 12 derivaciones solicitado en menos de 10 minutos.',
        },
        {
          documentType: 'MEDICAL_REPORT',
          title: 'Informe médico inicial de emergencias',
          content:
            'Paciente femenina de 54 años con dolor torácico opresivo de inicio súbito. ECG con alteraciones inespecíficas de la repolarización. Troponina inicial pendiente. Se mantiene en observación con monitoreo continuo.',
        },
        {
          documentType: 'COST_ESTIMATE',
          title: 'Estimado de costos',
          content: 'Observación en unidad coronaria 24 h, enzimas seriadas, ecocardiograma. Total estimado B/. 12,400.00.',
        },
      ],
    },
    followUps: [
      {
        id: 'red-add-specialist-report',
        label: 'Adjuntar informe de cardiología',
        description:
          'Cardiología documenta el antecedente de hipertensión, su declaración en la suscripción y la relación con el evento actual.',
        expectedStatusAfter: 'VERIFIED',
        evidence: {
          documentType: 'SPECIALIST_REPORT',
          title: 'Informe de cardiología — antecedente de hipertensión arterial',
          content:
            'Se documenta antecedente de hipertensión arterial esencial (I10) en control ambulatorio, declarado por la asegurada durante la suscripción de la póliza POL-3003 y aceptado sin exclusión. El evento actual corresponde a un síndrome coronario agudo atendido como emergencia. La condición previa está cubierta conforme a la cláusula de emergencias del plan.',
          submittedBy: 'hospital:HOSP-PTY-01',
          metadata: { addressesConditionCodes: ['I10', 'E78.5'] },
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: 'extra-expired-policy',
    code: 'EXTRA',
    title: 'Póliza vencida: el Safety Gate lo impide siempre',
    narrative:
      'Caso de control de seguridad. Aunque el resto del expediente esté perfecto, una póliza vencida nunca produce VERIFIED: el Safety Gate determinístico lo impide antes de que el modelo pueda opinar.',
    expectedStatus: 'HUMAN_REVIEW',
    expectedRequiresHuman: true,
    admission: {
      hospitalCode: 'HOSP-PTY-01',
      patientNationalId: '8-555-4444',
      policyNumber: 'POL-4004',
      admissionReason: 'Crisis asmática moderada con disnea en reposo.',
      admissionReasonCode: 'J45.9',
      triageLevel: 'ORANGE',
      estimatedCost: 2100,
      scenarioId: 'extra-expired-policy',
      attachedDocuments: [
        {
          documentType: 'ADMISSION_FORM',
          title: 'Formulario de ingreso a emergencias',
          content: 'Ingreso 08:20. Sibilancias difusas, SatO2 93%. Se inicia nebulización.',
        },
        {
          documentType: 'PATIENT_ID',
          title: 'Documento de identidad verificado',
          content: 'Cédula 8-555-4444 verificada presencialmente por admisiones.',
        },
        {
          documentType: 'MEDICAL_REPORT',
          title: 'Informe médico de emergencias',
          content: 'Crisis asmática moderada. Buena respuesta a broncodilatadores. Se mantiene en observación 4 horas.',
        },
      ],
    },
    followUps: [],
  },

  // -------------------------------------------------------------------------
  {
    id: 'extra-out-of-network',
    code: 'EXTRA',
    title: 'Hospital fuera de red: escala a revisión humana',
    narrative:
      'La póliza está vigente pero el hospital no pertenece a la red. El caso escala a revisión humana para decidir el tratamiento administrativo, sin afectar la atención del paciente.',
    expectedStatus: 'HUMAN_REVIEW',
    expectedRequiresHuman: true,
    admission: {
      hospitalCode: 'HOSP-PTY-99',
      patientNationalId: '8-888-1111',
      policyNumber: 'POL-1001',
      admissionReason: 'Esguince de tobillo derecho grado II tras caída.',
      admissionReasonCode: 'S93.4',
      triageLevel: 'GREEN',
      estimatedCost: 600,
      scenarioId: 'extra-out-of-network',
      attachedDocuments: [
        {
          documentType: 'ADMISSION_FORM',
          title: 'Formulario de ingreso a emergencias',
          content: 'Ingreso 16:45. Dolor e inflamación en tobillo derecho. Deambulación limitada.',
        },
        {
          documentType: 'PATIENT_ID',
          title: 'Documento de identidad verificado',
          content: 'Cédula 8-888-1111 verificada presencialmente por admisiones.',
        },
      ],
    },
    followUps: [],
  },
];

export function findScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}
