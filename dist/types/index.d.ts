export interface Appointment {
    appointment_id: string;
    mrno?: string;
    date: string;
    time: string;
    patient_name: string;
    patient_phone?: string;
    symptoms_brief?: string;
    doctor_id?: number;
    doctor_name?: string;
    status: string;
    prescription_file_path?: string;
    prescription_signature?: any;
    prescription_signed?: boolean;
    prescription_signed_at?: string;
    created_at: string;
    updated_at?: string;
}
export interface Medicine {
    id: number;
    name: string;
    price: number;
    quantity: number;
    stock_status: 'in_stock' | 'low_stock';
    expiry_date: string | null;
    created_at: string;
    updated_at: string;
}
export interface Prescription {
    id: number;
    created_at: string;
    appointment_id: string;
    medication_name: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    notes?: string;
    dispense_status: boolean;
}
export interface Bill {
    bill_id: string;
    appointment_id: string;
    medication_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    payment_mode: 'cash' | 'online';
    transaction_id?: string;
    payment_status: string;
    created_at: string;
}
export interface PrescriptionWithDetails extends Prescription {
    patient_name: string;
    doctor_name?: string;
    date: string;
}
export interface BillWithDetails extends Bill {
    patient_name: string;
}
export interface Department {
    sub_department_id: number;
    sub_department_name: string;
    service_types: ServiceType[];
}
export interface ServiceType {
    service_type_id: number;
    service_type_name: string;
    tests: Test[];
}
export interface Test {
    test_id: number;
    test_name: string;
    unit: string;
    normal_min: number;
    normal_max: number;
}
//# sourceMappingURL=index.d.ts.map