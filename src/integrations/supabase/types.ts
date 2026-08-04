export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_campaigns: {
        Row: {
          body: string | null
          created_at: string
          cta_url: string | null
          external_id: string | null
          franchisee_id: string | null
          headline: string | null
          id: string
          last_synced_at: string | null
          name: string
          preview_url: string | null
          source: string
          spend_total: number
          status: string
          territory_id: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          cta_url?: string | null
          external_id?: string | null
          franchisee_id?: string | null
          headline?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          preview_url?: string | null
          source: string
          spend_total?: number
          status?: string
          territory_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          cta_url?: string | null
          external_id?: string | null
          franchisee_id?: string | null
          headline?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          preview_url?: string | null
          source?: string
          spend_total?: number
          status?: string
          territory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          field: string
          franchisee_id: string
          id: string
          new_value: string | null
          old_value: string | null
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field: string
          franchisee_id: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field?: string
          franchisee_id?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_audit_log_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string
          created_at: string
          enrollment_id: string
          id: string
          marked_by: string | null
          notes: string | null
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          attendance_date?: string
          created_at?: string
          enrollment_id: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          attendance_date?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      batches: {
        Row: {
          batch_code: string
          capacity: number
          course_id: string
          created_at: string
          end_date: string | null
          id: string
          location: string | null
          mode: Database["public"]["Enums"]["batch_mode"]
          notes: string | null
          start_date: string
          status: Database["public"]["Enums"]["batch_status"]
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          batch_code: string
          capacity?: number
          course_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          location?: string | null
          mode?: Database["public"]["Enums"]["batch_mode"]
          notes?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["batch_status"]
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          batch_code?: string
          capacity?: number
          course_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          location?: string | null
          mode?: Database["public"]["Enums"]["batch_mode"]
          notes?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["batch_status"]
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          certificate_code: string
          created_at: string
          enrollment_id: string
          grade: string | null
          id: string
          issued_on: string
          pdf_url: string | null
          remarks: string | null
        }
        Insert: {
          certificate_code: string
          created_at?: string
          enrollment_id: string
          grade?: string | null
          id?: string
          issued_on?: string
          pdf_url?: string | null
          remarks?: string | null
        }
        Update: {
          certificate_code?: string
          created_at?: string
          enrollment_id?: string
          grade?: string | null
          id?: string
          issued_on?: string
          pdf_url?: string | null
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          address: Json | null
          brand: string | null
          company_type: Database["public"]["Enums"]["company_type"]
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          gstin: string | null
          id: string
          invoice_prefix: string | null
          is_demo: boolean
          legal_name: string | null
          name: string
          pan: string | null
          parent_company_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: Json | null
          brand?: string | null
          company_type?: Database["public"]["Enums"]["company_type"]
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          invoice_prefix?: string | null
          is_demo?: boolean
          legal_name?: string | null
          name: string
          pan?: string | null
          parent_company_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: Json | null
          brand?: string | null
          company_type?: Database["public"]["Enums"]["company_type"]
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          invoice_prefix?: string | null
          is_demo?: boolean
          legal_name?: string | null
          name?: string
          pan?: string | null
          parent_company_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          duration_weeks: number
          fee_amount: number
          id: string
          level: string | null
          status: Database["public"]["Enums"]["course_status"]
          title: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          duration_weeks?: number
          fee_amount?: number
          id?: string
          level?: string | null
          status?: Database["public"]["Enums"]["course_status"]
          title: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          duration_weeks?: number
          fee_amount?: number
          id?: string
          level?: string | null
          status?: Database["public"]["Enums"]["course_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: string
          created_at: string
          description: string | null
          head_employee_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          head_employee_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          head_employee_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          doc_kind: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          external_url: string | null
          id: string
          is_demo: boolean
          storage_path: string | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_kind?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          external_url?: string | null
          id?: string
          is_demo?: boolean
          storage_path?: string | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_kind?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          external_url?: string | null
          id?: string
          is_demo?: boolean
          storage_path?: string | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      employee_attendance: {
        Row: {
          attendance_date: string
          check_in: string | null
          check_out: string | null
          created_at: string
          employee_id: string
          hours_worked: number
          id: string
          marked_by: string | null
          notes: string | null
          status: Database["public"]["Enums"]["emp_attendance_status"]
          updated_at: string
        }
        Insert: {
          attendance_date?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id: string
          hours_worked?: number
          id?: string
          marked_by?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["emp_attendance_status"]
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id?: string
          hours_worked?: number
          id?: string
          marked_by?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["emp_attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          aadhar: string | null
          address: string | null
          allowances: number
          avatar_url: string | null
          bank_account: string | null
          bank_ifsc: string | null
          bank_name: string | null
          basic_salary: number
          city: string | null
          created_at: string
          date_of_birth: string | null
          date_of_exit: string | null
          date_of_joining: string
          department_id: string | null
          designation: string | null
          email: string | null
          employee_code: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          full_name: string
          gender: string | null
          hra: number
          id: string
          monthly_ctc: number
          notes: string | null
          pan: string | null
          phone: string | null
          reporting_to: string | null
          state: string | null
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          aadhar?: string | null
          address?: string | null
          allowances?: number
          avatar_url?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          basic_salary?: number
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          date_of_exit?: string | null
          date_of_joining?: string
          department_id?: string | null
          designation?: string | null
          email?: string | null
          employee_code: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          full_name: string
          gender?: string | null
          hra?: number
          id?: string
          monthly_ctc?: number
          notes?: string | null
          pan?: string | null
          phone?: string | null
          reporting_to?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          aadhar?: string | null
          address?: string | null
          allowances?: number
          avatar_url?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          basic_salary?: number
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          date_of_exit?: string | null
          date_of_joining?: string
          department_id?: string | null
          designation?: string | null
          email?: string | null
          employee_code?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          full_name?: string
          gender?: string | null
          hra?: number
          id?: string
          monthly_ctc?: number
          notes?: string | null
          pan?: string | null
          phone?: string | null
          reporting_to?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          batch_id: string
          created_at: string
          discount: number
          enrolled_on: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          total_fee: number
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          discount?: number
          enrolled_on?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          total_fee?: number
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          discount?: number
          enrolled_on?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          total_fee?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          monthly_budget: number
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          monthly_budget?: number
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          monthly_budget?: number
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          description: string | null
          expense_date: string
          franchisee_id: string | null
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_url: string | null
          recorded_by: string | null
          reference: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          expense_date?: string
          franchisee_id?: string | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_url?: string | null
          recorded_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          expense_date?: string
          franchisee_id?: string | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_url?: string | null
          recorded_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount: number
          created_at: string
          due_on: string | null
          enrollment_id: string
          id: string
          method: string | null
          notes: string | null
          paid_on: string | null
          receipt_number: string | null
          recorded_by: string | null
          reference: string | null
          status: Database["public"]["Enums"]["fee_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_on?: string | null
          enrollment_id: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_on?: string | null
          receipt_number?: string | null
          recorded_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["fee_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_on?: string | null
          enrollment_id?: string
          id?: string
          method?: string | null
          notes?: string | null
          paid_on?: string | null
          receipt_number?: string | null
          recorded_by?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["fee_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_agreements: {
        Row: {
          created_at: string
          franchisee_id: string
          generated_by: string | null
          id: string
          merged_html: string | null
          notes: string | null
          product_id: string
          sent_at: string | null
          signed_at: string | null
          signed_pdf_url: string | null
          status: Database["public"]["Enums"]["franchise_agreement_status"]
          storage_path: string | null
          template_snapshot: string | null
          updated_at: string
          valid_from: string | null
          valid_till: string | null
          version: string
        }
        Insert: {
          created_at?: string
          franchisee_id: string
          generated_by?: string | null
          id?: string
          merged_html?: string | null
          notes?: string | null
          product_id: string
          sent_at?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["franchise_agreement_status"]
          storage_path?: string | null
          template_snapshot?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_till?: string | null
          version?: string
        }
        Update: {
          created_at?: string
          franchisee_id?: string
          generated_by?: string | null
          id?: string
          merged_html?: string | null
          notes?: string | null
          product_id?: string
          sent_at?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["franchise_agreement_status"]
          storage_path?: string | null
          template_snapshot?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_till?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchise_agreements_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_agreements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "franchise_products"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_product_changes: {
        Row: {
          changed_at: string
          changed_by: string | null
          created_at: string
          effective_date: string
          franchisee_id: string
          id: string
          mode: string
          new_product_id: string | null
          new_values_json: Json
          old_product_id: string | null
          old_values_json: Json
          reason: string | null
          remarks: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          effective_date?: string
          franchisee_id: string
          id?: string
          mode?: string
          new_product_id?: string | null
          new_values_json?: Json
          old_product_id?: string | null
          old_values_json?: Json
          reason?: string | null
          remarks?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          effective_date?: string
          franchisee_id?: string
          id?: string
          mode?: string
          new_product_id?: string | null
          new_values_json?: Json
          old_product_id?: string | null
          old_values_json?: Json
          reason?: string | null
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_product_changes_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_product_changes_new_product_id_fkey"
            columns: ["new_product_id"]
            isOneToOne: false
            referencedRelation: "franchise_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_product_changes_old_product_id_fkey"
            columns: ["old_product_id"]
            isOneToOne: false
            referencedRelation: "franchise_products"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_product_commissions: {
        Row: {
          amount: number | null
          created_at: string
          frequency: string | null
          id: string
          kind: string
          label: string
          notes: string | null
          percent: number | null
          product_id: string
          sort_order: number
        }
        Insert: {
          amount?: number | null
          created_at?: string
          frequency?: string | null
          id?: string
          kind: string
          label: string
          notes?: string | null
          percent?: number | null
          product_id: string
          sort_order?: number
        }
        Update: {
          amount?: number | null
          created_at?: string
          frequency?: string | null
          id?: string
          kind?: string
          label?: string
          notes?: string | null
          percent?: number | null
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "franchise_product_commissions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "franchise_products"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_product_media: {
        Row: {
          caption: string | null
          content_type: string | null
          created_at: string
          created_by: string | null
          file_name: string | null
          file_size_bytes: number | null
          id: string
          kind: string
          product_id: string
          sort_order: number
          storage_path: string | null
          url: string
        }
        Insert: {
          caption?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          kind: string
          product_id: string
          sort_order?: number
          storage_path?: string | null
          url: string
        }
        Update: {
          caption?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          kind?: string
          product_id?: string
          sort_order?: number
          storage_path?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchise_product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "franchise_products"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_product_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      franchise_products: {
        Row: {
          agreement_template: string | null
          brand_logo: string | null
          brand_name: string | null
          brochure_url: string | null
          category: string | null
          created_at: string
          created_by: string | null
          expected_roi_percent: number | null
          gst_percent: number
          highlights: Json
          id: string
          investment_amount: number
          is_featured: boolean
          lock_in_months: number
          long_description: string | null
          minimum_guarantee: number
          name: string
          profit_margin_percent: number | null
          requirements: Json
          revenue_model_id: string | null
          revenue_share_percent: number
          roi_timeline_months: number | null
          royalty_percent: number
          security_deposit: number
          short_description: string | null
          status: string
          type_id: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          agreement_template?: string | null
          brand_logo?: string | null
          brand_name?: string | null
          brochure_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          expected_roi_percent?: number | null
          gst_percent?: number
          highlights?: Json
          id?: string
          investment_amount?: number
          is_featured?: boolean
          lock_in_months?: number
          long_description?: string | null
          minimum_guarantee?: number
          name: string
          profit_margin_percent?: number | null
          requirements?: Json
          revenue_model_id?: string | null
          revenue_share_percent?: number
          roi_timeline_months?: number | null
          royalty_percent?: number
          security_deposit?: number
          short_description?: string | null
          status?: string
          type_id?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          agreement_template?: string | null
          brand_logo?: string | null
          brand_name?: string | null
          brochure_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          expected_roi_percent?: number | null
          gst_percent?: number
          highlights?: Json
          id?: string
          investment_amount?: number
          is_featured?: boolean
          lock_in_months?: number
          long_description?: string | null
          minimum_guarantee?: number
          name?: string
          profit_margin_percent?: number | null
          requirements?: Json
          revenue_model_id?: string | null
          revenue_share_percent?: number
          roi_timeline_months?: number | null
          royalty_percent?: number
          security_deposit?: number
          short_description?: string | null
          status?: string
          type_id?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_products_revenue_model_id_fkey"
            columns: ["revenue_model_id"]
            isOneToOne: false
            referencedRelation: "franchise_revenue_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_products_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "franchise_product_types"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_revenue_model_splits: {
        Row: {
          created_at: string
          id: string
          model_id: string
          notes: string | null
          party_label: string
          percent: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          model_id: string
          notes?: string | null
          party_label: string
          percent: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          model_id?: string
          notes?: string | null
          party_label?: string
          percent?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "franchise_revenue_model_splits_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "franchise_revenue_models"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_revenue_models: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      franchise_roi_scenarios: {
        Row: {
          created_at: string
          id: string
          inputs: Json
          name: string
          notes: string | null
          outputs: Json
          product_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inputs?: Json
          name: string
          notes?: string | null
          outputs?: Json
          product_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inputs?: Json
          name?: string
          notes?: string | null
          outputs?: Json
          product_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchise_roi_scenarios_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "franchise_products"
            referencedColumns: ["id"]
          },
        ]
      }
      franchisee_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          delivered: boolean
          delivered_at: string | null
          franchisee_id: string
          id: string
          login_email: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivered?: boolean
          delivered_at?: string | null
          franchisee_id: string
          id?: string
          login_email: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivered?: boolean
          delivered_at?: string | null
          franchisee_id?: string
          id?: string
          login_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchisee_credentials_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
        ]
      }
      franchisee_documents: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string | null
          file_url: string
          franchisee_id: string
          id: string
          is_verified: boolean
          kind: Database["public"]["Enums"]["franchisee_document_kind"]
          notes: string | null
          size_bytes: number | null
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name?: string | null
          file_url: string
          franchisee_id: string
          id?: string
          is_verified?: boolean
          kind?: Database["public"]["Enums"]["franchisee_document_kind"]
          notes?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string | null
          file_url?: string
          franchisee_id?: string
          id?: string
          is_verified?: boolean
          kind?: Database["public"]["Enums"]["franchisee_document_kind"]
          notes?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchisee_documents_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
        ]
      }
      franchisee_targets: {
        Row: {
          city: string
          created_at: string
          franchisee_id: string | null
          id: string
          model_item_id: string
          notes: string | null
          period_month: string
          target_numbers: number
          updated_at: string
        }
        Insert: {
          city?: string
          created_at?: string
          franchisee_id?: string | null
          id?: string
          model_item_id: string
          notes?: string | null
          period_month?: string
          target_numbers?: number
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          franchisee_id?: string | null
          id?: string
          model_item_id?: string
          notes?: string | null
          period_month?: string
          target_numbers?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchisee_targets_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchisee_targets_model_item_id_fkey"
            columns: ["model_item_id"]
            isOneToOne: false
            referencedRelation: "revenue_model_items"
            referencedColumns: ["id"]
          },
        ]
      }
      franchisees: {
        Row: {
          aadhaar_number: string | null
          academy_pct: number
          academy_percent: number
          agreement_date: string | null
          agreement_expiry: string | null
          agreement_number: string | null
          agreement_url: string | null
          agreement_version: string | null
          area_sqft: number | null
          base_roi_pct: number
          cctv_count: number
          chairs: number
          computer_count: number
          created_at: string
          dark_store_pct: number
          effective_product_date: string | null
          email: string | null
          emporium_pct: number
          equipment_verified: boolean
          equipment_verified_at: string | null
          franchise_commission_amount: number
          franchise_fee: number
          franchise_product_id: string | null
          franchise_type: string
          full_name: string
          gst_number: string | null
          id: string
          investment_amount: number
          is_demo: boolean
          joined_at: string
          mall_percent: number
          manager_user_id: string | null
          mg_percent: number
          notes: string | null
          pan_number: string | null
          payment_status: string | null
          phone: string | null
          printer_count: number
          product_change_note: string | null
          product_change_reason: string | null
          royalty_percent: number
          sales_executive_user_id: string | null
          status: Database["public"]["Enums"]["franchisee_status"]
          tables_count: number
          territory_approved: boolean
          territory_area: string | null
          territory_city: string | null
          territory_country: string | null
          territory_district: string | null
          territory_end_date: string | null
          territory_exclusive: boolean
          territory_id: string | null
          territory_pincode: string | null
          territory_radius_km: number | null
          territory_start_date: string | null
          territory_state: string | null
          tns_percent: number
          updated_at: string
          user_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          aadhaar_number?: string | null
          academy_pct?: number
          academy_percent?: number
          agreement_date?: string | null
          agreement_expiry?: string | null
          agreement_number?: string | null
          agreement_url?: string | null
          agreement_version?: string | null
          area_sqft?: number | null
          base_roi_pct?: number
          cctv_count?: number
          chairs?: number
          computer_count?: number
          created_at?: string
          dark_store_pct?: number
          effective_product_date?: string | null
          email?: string | null
          emporium_pct?: number
          equipment_verified?: boolean
          equipment_verified_at?: string | null
          franchise_commission_amount?: number
          franchise_fee?: number
          franchise_product_id?: string | null
          franchise_type?: string
          full_name: string
          gst_number?: string | null
          id?: string
          investment_amount?: number
          is_demo?: boolean
          joined_at?: string
          mall_percent?: number
          manager_user_id?: string | null
          mg_percent?: number
          notes?: string | null
          pan_number?: string | null
          payment_status?: string | null
          phone?: string | null
          printer_count?: number
          product_change_note?: string | null
          product_change_reason?: string | null
          royalty_percent?: number
          sales_executive_user_id?: string | null
          status?: Database["public"]["Enums"]["franchisee_status"]
          tables_count?: number
          territory_approved?: boolean
          territory_area?: string | null
          territory_city?: string | null
          territory_country?: string | null
          territory_district?: string | null
          territory_end_date?: string | null
          territory_exclusive?: boolean
          territory_id?: string | null
          territory_pincode?: string | null
          territory_radius_km?: number | null
          territory_start_date?: string | null
          territory_state?: string | null
          tns_percent?: number
          updated_at?: string
          user_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          aadhaar_number?: string | null
          academy_pct?: number
          academy_percent?: number
          agreement_date?: string | null
          agreement_expiry?: string | null
          agreement_number?: string | null
          agreement_url?: string | null
          agreement_version?: string | null
          area_sqft?: number | null
          base_roi_pct?: number
          cctv_count?: number
          chairs?: number
          computer_count?: number
          created_at?: string
          dark_store_pct?: number
          effective_product_date?: string | null
          email?: string | null
          emporium_pct?: number
          equipment_verified?: boolean
          equipment_verified_at?: string | null
          franchise_commission_amount?: number
          franchise_fee?: number
          franchise_product_id?: string | null
          franchise_type?: string
          full_name?: string
          gst_number?: string | null
          id?: string
          investment_amount?: number
          is_demo?: boolean
          joined_at?: string
          mall_percent?: number
          manager_user_id?: string | null
          mg_percent?: number
          notes?: string | null
          pan_number?: string | null
          payment_status?: string | null
          phone?: string | null
          printer_count?: number
          product_change_note?: string | null
          product_change_reason?: string | null
          royalty_percent?: number
          sales_executive_user_id?: string | null
          status?: Database["public"]["Enums"]["franchisee_status"]
          tables_count?: number
          territory_approved?: boolean
          territory_area?: string | null
          territory_city?: string | null
          territory_country?: string | null
          territory_district?: string | null
          territory_end_date?: string | null
          territory_exclusive?: boolean
          territory_id?: string | null
          territory_pincode?: string | null
          territory_radius_km?: number | null
          territory_start_date?: string | null
          territory_state?: string | null
          tns_percent?: number
          updated_at?: string
          user_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchisees_franchise_product_id_fkey"
            columns: ["franchise_product_id"]
            isOneToOne: false
            referencedRelation: "franchise_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchisees_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchisees_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_audit: {
        Row: {
          action: string
          at: string
          id: string
          payload: Json | null
          resource: string | null
          session_id: string
        }
        Insert: {
          action: string
          at?: string
          id?: string
          payload?: Json | null
          resource?: string | null
          session_id: string
        }
        Update: {
          action?: string
          at?: string
          id?: string
          payload?: Json | null
          resource?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_audit_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "impersonation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          acting_admin_id: string
          ended_at: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          expires_at: string
          id: string
          impersonated_user_id: string | null
          ip: string | null
          mode: Database["public"]["Enums"]["impersonation_mode"]
          started_at: string
          token_hash: string
          user_agent: string | null
        }
        Insert: {
          acting_admin_id: string
          ended_at?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          expires_at: string
          id?: string
          impersonated_user_id?: string | null
          ip?: string | null
          mode?: Database["public"]["Enums"]["impersonation_mode"]
          started_at?: string
          token_hash: string
          user_agent?: string | null
        }
        Update: {
          acting_admin_id?: string
          ended_at?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          expires_at?: string
          id?: string
          impersonated_user_id?: string | null
          ip?: string | null
          mode?: Database["public"]["Enums"]["impersonation_mode"]
          started_at?: string
          token_hash?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          discount_pct: number
          gst_pct: number
          hsn_code: string | null
          id: string
          invoice_id: string
          is_student_product: boolean
          line_gst: number
          line_subtotal: number
          line_total: number
          product_id: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_pct?: number
          gst_pct?: number
          hsn_code?: string | null
          id?: string
          invoice_id: string
          is_student_product?: boolean
          line_gst?: number
          line_subtotal?: number
          line_total?: number
          product_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_pct?: number
          gst_pct?: number
          hsn_code?: string | null
          id?: string
          invoice_id?: string
          is_student_product?: boolean
          line_gst?: number
          line_subtotal?: number
          line_total?: number
          product_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_numbering_rules: {
        Row: {
          company_id: string
          created_at: string
          current_seq: number
          doc_type: Database["public"]["Enums"]["invoice_doc_type"]
          financial_year: string
          format: string
          id: string
          prefix: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          current_seq?: number
          doc_type: Database["public"]["Enums"]["invoice_doc_type"]
          financial_year: string
          format?: string
          id?: string
          prefix: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          current_seq?: number
          doc_type?: Database["public"]["Enums"]["invoice_doc_type"]
          financial_year?: string
          format?: string
          id?: string
          prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_numbering_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_share_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          order_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          order_id: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          order_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_share_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          archived_at: string | null
          archived_by: string | null
          archived_reason: string | null
          bill_to_address: Json | null
          bill_to_company_id: string | null
          bill_to_entity_id: string | null
          bill_to_entity_type: Database["public"]["Enums"]["entity_type"] | null
          bill_to_gstin: string | null
          bill_to_name: string | null
          cancellation_reason: string | null
          cgst_total: number
          company_id: string
          created_at: string
          discount_total: number
          doc_type: Database["public"]["Enums"]["invoice_doc_type"]
          due_date: string | null
          franchise_mapping_type: Database["public"]["Enums"]["franchise_mapping_type"]
          franchisee_id: string | null
          from_state: string | null
          grand_total: number
          gst_total: number
          id: string
          igst_total: number
          invoice_category: Database["public"]["Enums"]["invoice_category"]
          invoice_date: string
          invoice_number: string | null
          is_demo: boolean
          is_intercompany: boolean
          issued_at: string | null
          issued_by: string | null
          notes: string | null
          parent_invoice_id: string | null
          payment_status: Database["public"]["Enums"]["pos_payment_status"]
          place_of_supply: string | null
          revision_no: number
          sgst_total: number
          source_document_ref: string | null
          source_document_url: string | null
          state_franchise_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_mode: string | null
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          bill_to_address?: Json | null
          bill_to_company_id?: string | null
          bill_to_entity_id?: string | null
          bill_to_entity_type?:
            | Database["public"]["Enums"]["entity_type"]
            | null
          bill_to_gstin?: string | null
          bill_to_name?: string | null
          cancellation_reason?: string | null
          cgst_total?: number
          company_id: string
          created_at?: string
          discount_total?: number
          doc_type?: Database["public"]["Enums"]["invoice_doc_type"]
          due_date?: string | null
          franchise_mapping_type?: Database["public"]["Enums"]["franchise_mapping_type"]
          franchisee_id?: string | null
          from_state?: string | null
          grand_total?: number
          gst_total?: number
          id?: string
          igst_total?: number
          invoice_category?: Database["public"]["Enums"]["invoice_category"]
          invoice_date?: string
          invoice_number?: string | null
          is_demo?: boolean
          is_intercompany?: boolean
          issued_at?: string | null
          issued_by?: string | null
          notes?: string | null
          parent_invoice_id?: string | null
          payment_status?: Database["public"]["Enums"]["pos_payment_status"]
          place_of_supply?: string | null
          revision_no?: number
          sgst_total?: number
          source_document_ref?: string | null
          source_document_url?: string | null
          state_franchise_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_mode?: string | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          bill_to_address?: Json | null
          bill_to_company_id?: string | null
          bill_to_entity_id?: string | null
          bill_to_entity_type?:
            | Database["public"]["Enums"]["entity_type"]
            | null
          bill_to_gstin?: string | null
          bill_to_name?: string | null
          cancellation_reason?: string | null
          cgst_total?: number
          company_id?: string
          created_at?: string
          discount_total?: number
          doc_type?: Database["public"]["Enums"]["invoice_doc_type"]
          due_date?: string | null
          franchise_mapping_type?: Database["public"]["Enums"]["franchise_mapping_type"]
          franchisee_id?: string | null
          from_state?: string | null
          grand_total?: number
          gst_total?: number
          id?: string
          igst_total?: number
          invoice_category?: Database["public"]["Enums"]["invoice_category"]
          invoice_date?: string
          invoice_number?: string | null
          is_demo?: boolean
          is_intercompany?: boolean
          issued_at?: string | null
          issued_by?: string | null
          notes?: string | null
          parent_invoice_id?: string | null
          payment_status?: Database["public"]["Enums"]["pos_payment_status"]
          place_of_supply?: string | null
          revision_no?: number
          sgst_total?: number
          source_document_ref?: string | null
          source_document_url?: string | null
          state_franchise_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_mode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_bill_to_company_id_fkey"
            columns: ["bill_to_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_state_franchise_id_fkey"
            columns: ["state_franchise_id"]
            isOneToOne: false
            referencedRelation: "state_franchises"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          content: string | null
          created_at: string
          followup_at: string | null
          id: string
          lead_id: string
          user_id: string | null
        }
        Insert: {
          activity_type: string
          content?: string | null
          created_at?: string
          followup_at?: string | null
          id?: string
          lead_id: string
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          content?: string | null
          created_at?: string
          followup_at?: string | null
          id?: string
          lead_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_routing_rules: {
        Row: {
          add_tag: string | null
          assign_franchisee_id: string | null
          assign_territory_id: string | null
          assign_to_user: string | null
          created_at: string
          enabled: boolean
          id: string
          match_campaign: string | null
          match_city: string | null
          match_source: string | null
          match_state: string | null
          match_utm_campaign: string | null
          match_utm_medium: string | null
          match_utm_source: string | null
          name: string
          notes: string | null
          priority: number
          set_stage: Database["public"]["Enums"]["lead_stage"] | null
          updated_at: string
        }
        Insert: {
          add_tag?: string | null
          assign_franchisee_id?: string | null
          assign_territory_id?: string | null
          assign_to_user?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          match_campaign?: string | null
          match_city?: string | null
          match_source?: string | null
          match_state?: string | null
          match_utm_campaign?: string | null
          match_utm_medium?: string | null
          match_utm_source?: string | null
          name: string
          notes?: string | null
          priority?: number
          set_stage?: Database["public"]["Enums"]["lead_stage"] | null
          updated_at?: string
        }
        Update: {
          add_tag?: string | null
          assign_franchisee_id?: string | null
          assign_territory_id?: string | null
          assign_to_user?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          match_campaign?: string | null
          match_city?: string | null
          match_source?: string | null
          match_state?: string | null
          match_utm_campaign?: string | null
          match_utm_medium?: string | null
          match_utm_source?: string | null
          name?: string
          notes?: string | null
          priority?: number
          set_stage?: Database["public"]["Enums"]["lead_stage"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_routing_rules_assign_franchisee_id_fkey"
            columns: ["assign_franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_routing_rules_assign_territory_id_fkey"
            columns: ["assign_territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_name: string | null
          assigned_to: string | null
          budget: number | null
          city: string | null
          created_at: string
          email: string | null
          franchise_product_id: string | null
          full_name: string
          id: string
          interest_stage: string | null
          notes: string | null
          phone: string | null
          score: number | null
          source: Database["public"]["Enums"]["lead_source"]
          stage: Database["public"]["Enums"]["lead_stage"]
          territory_id: string | null
          updated_at: string
        }
        Insert: {
          ad_name?: string | null
          assigned_to?: string | null
          budget?: number | null
          city?: string | null
          created_at?: string
          email?: string | null
          franchise_product_id?: string | null
          full_name: string
          id?: string
          interest_stage?: string | null
          notes?: string | null
          phone?: string | null
          score?: number | null
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          territory_id?: string | null
          updated_at?: string
        }
        Update: {
          ad_name?: string | null
          assigned_to?: string | null
          budget?: number | null
          city?: string | null
          created_at?: string
          email?: string | null
          franchise_product_id?: string | null
          full_name?: string
          id?: string
          interest_stage?: string | null
          notes?: string | null
          phone?: string | null
          score?: number | null
          source?: Database["public"]["Enums"]["lead_source"]
          stage?: Database["public"]["Enums"]["lead_stage"]
          territory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_franchise_product_id_fkey"
            columns: ["franchise_product_id"]
            isOneToOne: false
            referencedRelation: "franchise_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          approver_note: string | null
          created_at: string
          days: number
          employee_id: string
          from_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          status: Database["public"]["Enums"]["leave_status"]
          to_date: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          approver_note?: string | null
          created_at?: string
          days?: number
          employee_id: string
          from_date: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          status?: Database["public"]["Enums"]["leave_status"]
          to_date: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          approver_note?: string | null
          created_at?: string
          days?: number
          employee_id?: string
          from_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          status?: Database["public"]["Enums"]["leave_status"]
          to_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      org_roi_settings: {
        Row: {
          calc_method: string
          created_at: string
          default_academy_percent: number
          default_commission: number
          default_mall_percent: number
          default_mg_percent: number
          default_royalty_percent: number
          default_tns_percent: number
          gst_mode: string
          id: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          calc_method?: string
          created_at?: string
          default_academy_percent?: number
          default_commission?: number
          default_mall_percent?: number
          default_mg_percent?: number
          default_royalty_percent?: number
          default_tns_percent?: number
          gst_mode?: string
          id?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          calc_method?: string
          created_at?: string
          default_academy_percent?: number
          default_commission?: number
          default_mall_percent?: number
          default_mg_percent?: number
          default_royalty_percent?: number
          default_tns_percent?: number
          gst_mode?: string
          id?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      org_settings: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          facebook_url: string | null
          id: number
          instagram_url: string | null
          lead_webhook_secret: string | null
          linkedin_url: string | null
          logo_url: string | null
          org_name: string
          primary_color: string | null
          twitter_url: string | null
          updated_at: string
          whatsapp_number: string | null
          youtube_url: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          facebook_url?: string | null
          id?: number
          instagram_url?: string | null
          lead_webhook_secret?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          org_name?: string
          primary_color?: string | null
          twitter_url?: string | null
          updated_at?: string
          whatsapp_number?: string | null
          youtube_url?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          facebook_url?: string | null
          id?: number
          instagram_url?: string | null
          lead_webhook_secret?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          org_name?: string
          primary_color?: string | null
          twitter_url?: string | null
          updated_at?: string
          whatsapp_number?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          counterparty_entity_id: string | null
          counterparty_entity_type:
            | Database["public"]["Enums"]["entity_type"]
            | null
          counterparty_name: string | null
          created_at: string
          direction: Database["public"]["Enums"]["payment_direction"]
          id: string
          invoice_id: string | null
          is_demo: boolean
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          payment_date: string
          recorded_by: string | null
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          company_id: string
          counterparty_entity_id?: string | null
          counterparty_entity_type?:
            | Database["public"]["Enums"]["entity_type"]
            | null
          counterparty_name?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["payment_direction"]
          id?: string
          invoice_id?: string | null
          is_demo?: boolean
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_date?: string
          recorded_by?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          counterparty_entity_id?: string | null
          counterparty_entity_type?:
            | Database["public"]["Enums"]["entity_type"]
            | null
          counterparty_name?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["payment_direction"]
          id?: string
          invoice_id?: string | null
          is_demo?: boolean
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_date?: string
          recorded_by?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          allowances: number
          basic_salary: number
          bonus: number
          created_at: string
          days_absent: number
          days_present: number
          employee_id: string
          gross_pay: number
          hra: number
          id: string
          net_pay: number
          notes: string | null
          other_deductions: number
          paid_days: number
          payroll_run_id: string
          pf_deduction: number
          tax_deduction: number
          total_deductions: number
        }
        Insert: {
          allowances?: number
          basic_salary?: number
          bonus?: number
          created_at?: string
          days_absent?: number
          days_present?: number
          employee_id: string
          gross_pay?: number
          hra?: number
          id?: string
          net_pay?: number
          notes?: string | null
          other_deductions?: number
          paid_days?: number
          payroll_run_id: string
          pf_deduction?: number
          tax_deduction?: number
          total_deductions?: number
        }
        Update: {
          allowances?: number
          basic_salary?: number
          bonus?: number
          created_at?: string
          days_absent?: number
          days_present?: number
          employee_id?: string
          gross_pay?: number
          hra?: number
          id?: string
          net_pay?: number
          notes?: string | null
          other_deductions?: number
          paid_days?: number
          payroll_run_id?: string
          pf_deduction?: number
          tax_deduction?: number
          total_deductions?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          employee_count: number
          id: string
          notes: string | null
          payroll_month: string
          processed_at: string | null
          processed_by: string | null
          status: Database["public"]["Enums"]["payroll_status"]
          total_deductions: number
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_count?: number
          id?: string
          notes?: string | null
          payroll_month: string
          processed_at?: string | null
          processed_by?: string | null
          status?: Database["public"]["Enums"]["payroll_status"]
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_count?: number
          id?: string
          notes?: string | null
          payroll_month?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: Database["public"]["Enums"]["payroll_status"]
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_student_product: boolean
          name: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_student_product?: boolean
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_student_product?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          hsn_code: string | null
          id: string
          image_url: string | null
          low_stock_threshold: number
          mrp: number
          name: string
          sale_price: number
          sku: string
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          mrp?: number
          name: string
          sale_price?: number
          sku: string
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          mrp?: number
          name?: string
          sale_price?: number
          sku?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          ordered_qty: number
          po_id: string
          product_id: string
          received_qty: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          ordered_qty?: number
          po_id: string
          product_id: string
          received_qty?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          ordered_qty?: number
          po_id?: string
          product_id?: string
          received_qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          expected_date: string | null
          id: string
          notes: string | null
          order_date: string
          po_number: string
          received_date: string | null
          status: Database["public"]["Enums"]["po_status"]
          supplier_id: string
          total_amount: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number: string
          received_date?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          supplier_id: string
          total_amount?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          po_number?: string
          received_date?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          supplier_id?: string
          total_amount?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_entries: {
        Row: {
          amount: number
          created_at: string
          franchisee_id: string | null
          id: string
          notes: string | null
          received_on: string
          recorded_by: string | null
          reference: string | null
          source: Database["public"]["Enums"]["revenue_source"]
          source_label: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          franchisee_id?: string | null
          id?: string
          notes?: string | null
          received_on?: string
          recorded_by?: string | null
          reference?: string | null
          source?: Database["public"]["Enums"]["revenue_source"]
          source_label?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          franchisee_id?: string | null
          id?: string
          notes?: string | null
          received_on?: string
          recorded_by?: string | null
          reference?: string | null
          source?: Database["public"]["Enums"]["revenue_source"]
          source_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_entries_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_model_items: {
        Row: {
          active: boolean
          category: string
          created_at: string
          default_target: number
          description: string | null
          franchisee_roi_pct: number
          id: string
          mrp: number
          offer_cost: number
          offer_value: number
          particulars: string
          sort_order: number
          state_partner_pct: number
          target_segment: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          default_target?: number
          description?: string | null
          franchisee_roi_pct?: number
          id?: string
          mrp?: number
          offer_cost?: number
          offer_value?: number
          particulars: string
          sort_order: number
          state_partner_pct?: number
          target_segment?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          default_target?: number
          description?: string | null
          franchisee_roi_pct?: number
          id?: string
          mrp?: number
          offer_cost?: number
          offer_value?: number
          particulars?: string
          sort_order?: number
          state_partner_pct?: number
          target_segment?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      roi_payouts: {
        Row: {
          academy_amount: number
          academy_incentive: number
          auto_computed: boolean
          base_roi: number
          created_at: string
          dark_store_incentive: number
          emporium_incentive: number
          final_payable: number
          franchisee_id: string
          id: string
          mall_amount: number
          mg_amount: number
          paid_at: string | null
          payable_reason: string | null
          payout_month: string
          status: Database["public"]["Enums"]["payout_status"]
          tns_amount: number
          total_amount: number
          variable_roi: number
        }
        Insert: {
          academy_amount?: number
          academy_incentive?: number
          auto_computed?: boolean
          base_roi?: number
          created_at?: string
          dark_store_incentive?: number
          emporium_incentive?: number
          final_payable?: number
          franchisee_id: string
          id?: string
          mall_amount?: number
          mg_amount?: number
          paid_at?: string | null
          payable_reason?: string | null
          payout_month: string
          status?: Database["public"]["Enums"]["payout_status"]
          tns_amount?: number
          total_amount?: number
          variable_roi?: number
        }
        Update: {
          academy_amount?: number
          academy_incentive?: number
          auto_computed?: boolean
          base_roi?: number
          created_at?: string
          dark_store_incentive?: number
          emporium_incentive?: number
          final_payable?: number
          franchisee_id?: string
          id?: string
          mall_amount?: number
          mg_amount?: number
          paid_at?: string | null
          payable_reason?: string | null
          payout_month?: string
          status?: Database["public"]["Enums"]["payout_status"]
          tns_amount?: number
          total_amount?: number
          variable_roi?: number
        }
        Relationships: [
          {
            foreignKeyName: "roi_payouts_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["pos_payment_method"]
          order_id: string
          paid_at: string
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["pos_payment_method"]
          order_id: string
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["pos_payment_method"]
          order_id?: string
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          created_at: string
          discount_pct: number
          gst_pct: number
          hsn_code: string | null
          id: string
          line_gst: number
          line_subtotal: number
          line_total: number
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          sku: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_pct?: number
          gst_pct?: number
          hsn_code?: string | null
          id?: string
          line_gst?: number
          line_subtotal?: number
          line_total?: number
          order_id: string
          product_id: string
          product_name: string
          quantity?: number
          sku?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          discount_pct?: number
          gst_pct?: number
          hsn_code?: string | null
          id?: string
          line_gst?: number
          line_subtotal?: number
          line_total?: number
          order_id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          sku?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          amount_paid: number
          cgst_amount: number
          company_id: string | null
          completed_at: string | null
          created_at: string
          customer_address: string | null
          customer_email: string | null
          customer_gstin: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_amount: number
          dispatch_tracking: string | null
          dispatched_at: string | null
          dispatched_by: string | null
          franchise_mapping_type:
            | Database["public"]["Enums"]["franchise_mapping_type"]
            | null
          franchisee_id: string | null
          grand_total: number
          gst_total: number
          id: string
          igst_amount: number
          invoice_category:
            | Database["public"]["Enums"]["invoice_category"]
            | null
          invoice_number: string | null
          notes: string | null
          payment_status: Database["public"]["Enums"]["pos_payment_status"]
          salon_branch_id: string | null
          served_by: string | null
          sgst_amount: number
          status: Database["public"]["Enums"]["pos_order_status"]
          subtotal: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          amount_paid?: number
          cgst_amount?: number
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_gstin?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number
          dispatch_tracking?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          franchise_mapping_type?:
            | Database["public"]["Enums"]["franchise_mapping_type"]
            | null
          franchisee_id?: string | null
          grand_total?: number
          gst_total?: number
          id?: string
          igst_amount?: number
          invoice_category?:
            | Database["public"]["Enums"]["invoice_category"]
            | null
          invoice_number?: string | null
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["pos_payment_status"]
          salon_branch_id?: string | null
          served_by?: string | null
          sgst_amount?: number
          status?: Database["public"]["Enums"]["pos_order_status"]
          subtotal?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          amount_paid?: number
          cgst_amount?: number
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_gstin?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number
          dispatch_tracking?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          franchise_mapping_type?:
            | Database["public"]["Enums"]["franchise_mapping_type"]
            | null
          franchisee_id?: string | null
          grand_total?: number
          gst_total?: number
          id?: string
          igst_amount?: number
          invoice_category?:
            | Database["public"]["Enums"]["invoice_category"]
            | null
          invoice_number?: string | null
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["pos_payment_status"]
          salon_branch_id?: string | null
          served_by?: string | null
          sgst_amount?: number
          status?: Database["public"]["Enums"]["pos_order_status"]
          subtotal?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_salon_branch_id_fkey"
            columns: ["salon_branch_id"]
            isOneToOne: false
            referencedRelation: "salon_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_branches: {
        Row: {
          address: Json | null
          city: string | null
          code: string | null
          company_id: string | null
          created_at: string
          id: string
          is_demo: boolean
          manager_user_id: string | null
          name: string
          parent_brand: string
          service_catalog: Json
          state: string | null
          status: string
          territory_id: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          city?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          manager_user_id?: string | null
          name: string
          parent_brand?: string
          service_catalog?: Json
          state?: string | null
          status?: string
          territory_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          city?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          manager_user_id?: string | null
          name?: string
          parent_brand?: string
          service_catalog?: Json
          state?: string | null
          status?: string
          territory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_branches_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      social_integrations: {
        Row: {
          active: boolean
          created_at: string
          credentials: Json | null
          display_name: string | null
          franchisee_id: string | null
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          source: string
          territory_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          credentials?: Json | null
          display_name?: string | null
          franchisee_id?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          source: string
          territory_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          credentials?: Json | null
          display_name?: string | null
          franchisee_id?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          source?: string
          territory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_integrations_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
        ]
      }
      social_lead_events: {
        Row: {
          assigned_franchisee_id: string | null
          assigned_territory_id: string | null
          assigned_to: string | null
          campaign: string | null
          created_at: string
          error_message: string | null
          id: string
          ip_address: string | null
          lead_id: string | null
          matched_rule_id: string | null
          payload: Json
          signature_valid: boolean
          source: string
          status: string
        }
        Insert: {
          assigned_franchisee_id?: string | null
          assigned_territory_id?: string | null
          assigned_to?: string | null
          campaign?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          lead_id?: string | null
          matched_rule_id?: string | null
          payload: Json
          signature_valid?: boolean
          source: string
          status?: string
        }
        Update: {
          assigned_franchisee_id?: string | null
          assigned_territory_id?: string | null
          assigned_to?: string | null
          campaign?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          lead_id?: string | null
          matched_rule_id?: string | null
          payload?: Json
          signature_valid?: boolean
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_lead_events_assigned_franchisee_id_fkey"
            columns: ["assigned_franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_lead_events_assigned_territory_id_fkey"
            columns: ["assigned_territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_lead_events_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "lead_routing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      state_franchise_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          delivered: boolean
          delivered_at: string | null
          id: string
          login_email: string
          state_franchise_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivered?: boolean
          delivered_at?: string | null
          id?: string
          login_email: string
          state_franchise_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivered?: boolean
          delivered_at?: string | null
          id?: string
          login_email?: string
          state_franchise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_franchise_credentials_state_franchise_id_fkey"
            columns: ["state_franchise_id"]
            isOneToOne: false
            referencedRelation: "state_franchises"
            referencedColumns: ["id"]
          },
        ]
      }
      state_franchise_incentive_ledger: {
        Row: {
          amount: number
          basis_amount: number | null
          created_at: string
          id: string
          is_demo: boolean
          kind: string
          notes: string | null
          paid_amount: number
          paid_at: string | null
          pct: number | null
          period_month: string
          related_entity_id: string | null
          related_entity_type: Database["public"]["Enums"]["entity_type"] | null
          state_franchise_id: string
          status: Database["public"]["Enums"]["ledger_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          basis_amount?: number | null
          created_at?: string
          id?: string
          is_demo?: boolean
          kind: string
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          pct?: number | null
          period_month: string
          related_entity_id?: string | null
          related_entity_type?:
            | Database["public"]["Enums"]["entity_type"]
            | null
          state_franchise_id: string
          status?: Database["public"]["Enums"]["ledger_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          basis_amount?: number | null
          created_at?: string
          id?: string
          is_demo?: boolean
          kind?: string
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          pct?: number | null
          period_month?: string
          related_entity_id?: string | null
          related_entity_type?:
            | Database["public"]["Enums"]["entity_type"]
            | null
          state_franchise_id?: string
          status?: Database["public"]["Enums"]["ledger_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_franchise_incentive_ledger_state_franchise_id_fkey"
            columns: ["state_franchise_id"]
            isOneToOne: false
            referencedRelation: "state_franchises"
            referencedColumns: ["id"]
          },
        ]
      }
      state_franchise_roi_ledger: {
        Row: {
          basis_amount: number
          created_at: string
          id: string
          is_demo: boolean
          notes: string | null
          paid_amount: number
          paid_at: string | null
          period_month: string
          roi_due: number
          roi_pct: number
          state_franchise_id: string
          status: Database["public"]["Enums"]["ledger_status"]
          updated_at: string
        }
        Insert: {
          basis_amount?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          period_month: string
          roi_due?: number
          roi_pct?: number
          state_franchise_id: string
          status?: Database["public"]["Enums"]["ledger_status"]
          updated_at?: string
        }
        Update: {
          basis_amount?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          period_month?: string
          roi_due?: number
          roi_pct?: number
          state_franchise_id?: string
          status?: Database["public"]["Enums"]["ledger_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_franchise_roi_ledger_state_franchise_id_fkey"
            columns: ["state_franchise_id"]
            isOneToOne: false
            referencedRelation: "state_franchises"
            referencedColumns: ["id"]
          },
        ]
      }
      state_franchise_targets: {
        Row: {
          activated_count: number
          contract_year: number
          created_at: string
          ends_on: string | null
          id: string
          per_activation_amount: number
          starts_on: string | null
          state_franchise_id: string
          target_count: number
          updated_at: string
        }
        Insert: {
          activated_count?: number
          contract_year?: number
          created_at?: string
          ends_on?: string | null
          id?: string
          per_activation_amount?: number
          starts_on?: string | null
          state_franchise_id: string
          target_count?: number
          updated_at?: string
        }
        Update: {
          activated_count?: number
          contract_year?: number
          created_at?: string
          ends_on?: string | null
          id?: string
          per_activation_amount?: number
          starts_on?: string | null
          state_franchise_id?: string
          target_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_franchise_targets_state_franchise_id_fkey"
            columns: ["state_franchise_id"]
            isOneToOne: false
            referencedRelation: "state_franchises"
            referencedColumns: ["id"]
          },
        ]
      }
      state_franchises: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          investment_amount: number
          is_demo: boolean
          joined_at: string
          notes: string | null
          phone: string | null
          state: string
          state_partner_pct: number
          status: Database["public"]["Enums"]["franchisee_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          investment_amount?: number
          is_demo?: boolean
          joined_at?: string
          notes?: string | null
          phone?: string | null
          state: string
          state_partner_pct?: number
          status?: Database["public"]["Enums"]["franchisee_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          investment_amount?: number
          is_demo?: boolean
          joined_at?: string
          notes?: string | null
          phone?: string | null
          state?: string
          state_partner_pct?: number
          status?: Database["public"]["Enums"]["franchisee_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      stock_levels: {
        Row: {
          id: string
          product_id: string
          quantity: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          destination_warehouse_id: string | null
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          product_id: string
          quantity: number
          reason: string | null
          recorded_by: string | null
          reference_id: string | null
          reference_type: string | null
          source_warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          destination_warehouse_id?: string | null
          id?: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          product_id: string
          quantity: number
          reason?: string | null
          recorded_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          source_warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          destination_warehouse_id?: string | null
          id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          product_id?: string
          quantity?: number
          reason?: string | null
          recorded_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
          source_warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_destination_warehouse_id_fkey"
            columns: ["destination_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_source_warehouse_id_fkey"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          gender: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      territories: {
        Row: {
          created_at: string
          id: string
          name: string
          region: string | null
          state: string
          state_franchise_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          region?: string | null
          state: string
          state_franchise_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          region?: string | null
          state?: string
          state_franchise_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "territories_state_franchise_id_fkey"
            columns: ["state_franchise_id"]
            isOneToOne: false
            referencedRelation: "state_franchises"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      trainers: {
        Row: {
          active: boolean
          bio: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          specialization: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          bio?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          specialization?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          bio?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          specialization?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_entity_access: {
        Row: {
          can_write: boolean
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          granted_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          can_write?: boolean
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          can_write?: boolean
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          code: string
          created_at: string
          franchisee_id: string | null
          id: string
          name: string
          state: string | null
          type: Database["public"]["Enums"]["warehouse_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          franchisee_id?: string | null
          id?: string
          name: string
          state?: string | null
          type?: Database["public"]["Enums"]["warehouse_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          franchisee_id?: string | null
          id?: string
          name?: string
          state?: string | null
          type?: Database["public"]["Enums"]["warehouse_type"]
          updated_at?: string
        }
        Relationships: []
      }
      webinar_registrations: {
        Row: {
          attended: boolean
          attended_at: string | null
          city: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          lead_id: string | null
          notes: string | null
          phone: string | null
          registered_at: string
          reminded_1h_at: string | null
          reminded_24h_at: string | null
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          webinar_id: string
        }
        Insert: {
          attended?: boolean
          attended_at?: string | null
          city?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          phone?: string | null
          registered_at?: string
          reminded_1h_at?: string | null
          reminded_24h_at?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          webinar_id: string
        }
        Update: {
          attended?: boolean
          attended_at?: string | null
          city?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          phone?: string | null
          registered_at?: string
          reminded_1h_at?: string | null
          reminded_24h_at?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_registrations_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinars: {
        Row: {
          capacity: number
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          host_name: string | null
          id: string
          join_url: string | null
          platform: Database["public"]["Enums"]["webinar_platform"]
          price: number
          reminder_1h_sent_at: string | null
          reminder_24h_sent_at: string | null
          scheduled_at: string
          slug: string
          status: Database["public"]["Enums"]["webinar_status"]
          title: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          capacity?: number
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          host_name?: string | null
          id?: string
          join_url?: string | null
          platform?: Database["public"]["Enums"]["webinar_platform"]
          price?: number
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          scheduled_at: string
          slug: string
          status?: Database["public"]["Enums"]["webinar_status"]
          title: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          capacity?: number
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          host_name?: string | null
          id?: string
          join_url?: string | null
          platform?: Database["public"]["Enums"]["webinar_platform"]
          price?: number
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          scheduled_at?: string
          slug?: string
          status?: Database["public"]["Enums"]["webinar_status"]
          title?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: { Args: { _user_id: string }; Returns: undefined }
      admin_grant_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          phone: string
          roles: Database["public"]["Enums"]["app_role"][]
        }[]
      }
      admin_revoke_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_set_user_active: {
        Args: { _active: boolean; _user_id: string }
        Returns: undefined
      }
      compute_franchisee_monthly_roi: {
        Args: { _franchisee_id: string; _month: string }
        Returns: {
          a: number
          academy_total: number
          b: number
          c: number
          final_payable: number
          mall_total: number
          mg: number
          reason: string
          tns_total: number
          variable_roi: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      recalc_invoice_payment_state: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      recompute_roi_payout: {
        Args: { _franchisee_id: string; _month: string }
        Returns: undefined
      }
      state_franchise_owns_franchisee: {
        Args: { _franchisee_id: string; _user_id: string }
        Returns: boolean
      }
      state_franchise_owns_territory: {
        Args: { _territory_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_entity: {
        Args: {
          _entity_id: string
          _entity_type: Database["public"]["Enums"]["entity_type"]
          _user_id: string
        }
        Returns: boolean
      }
      verify_certificate: {
        Args: { _code: string }
        Returns: {
          batch_code: string
          certificate_code: string
          course_title: string
          duration_weeks: number
          grade: string
          issued_on: string
          student_full_name: string
        }[]
      }
      webinar_seats_taken: { Args: { _webinar_id: string }; Returns: number }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "founder"
        | "franchisee"
        | "sales"
        | "accounts"
        | "inventory"
        | "academy_admin"
        | "webinar"
        | "hr"
        | "white_label"
        | "trainer"
        | "support"
        | "package_sales"
        | "nail_emporium"
        | "state_franchisee"
        | "academy_user"
        | "dark_store_user"
        | "salon_branch_user"
        | "auditor"
      attendance_status: "present" | "absent" | "late" | "excused"
      batch_mode: "online" | "offline" | "hybrid"
      batch_status: "upcoming" | "ongoing" | "completed" | "cancelled"
      company_type: "group" | "distributor" | "retailer" | "operator"
      course_status: "draft" | "published" | "archived"
      emp_attendance_status:
        | "present"
        | "absent"
        | "half_day"
        | "leave"
        | "holiday"
        | "weekoff"
      employee_status:
        | "active"
        | "on_leave"
        | "suspended"
        | "terminated"
        | "resigned"
      employment_type:
        | "full_time"
        | "part_time"
        | "contract"
        | "intern"
        | "consultant"
      enrollment_status: "active" | "completed" | "dropped" | "suspended"
      entity_type:
        | "company"
        | "state_franchise"
        | "city_franchise"
        | "academy"
        | "dark_store"
        | "salon_branch"
        | "department"
      expense_status: "pending" | "paid" | "cancelled"
      fee_status: "pending" | "paid" | "partial" | "overdue" | "waived"
      franchise_agreement_status:
        | "draft"
        | "sent"
        | "signed"
        | "expired"
        | "cancelled"
      franchise_mapping_type: "company_direct" | "master" | "state" | "city"
      franchisee_document_kind:
        | "aadhaar"
        | "pan"
        | "gst"
        | "agreement"
        | "brochure"
        | "photo"
        | "bank"
        | "other"
      franchisee_status: "active" | "onboarding" | "suspended" | "closed"
      impersonation_mode: "read_only" | "read_write"
      invoice_category:
        | "tns_turnover"
        | "academy_sales"
        | "mall_of_salon_sales"
        | "franchise_fee"
        | "royalty"
        | "product_sales"
        | "service_sales"
        | "other"
        | "membership"
      invoice_doc_type:
        | "b2b_tax"
        | "b2c"
        | "proforma"
        | "quotation"
        | "receipt"
        | "credit_note"
        | "debit_note"
      invoice_status: "draft" | "issued" | "cancelled" | "revised" | "paid"
      lead_source:
        | "meta"
        | "google"
        | "manual"
        | "referral"
        | "webinar"
        | "website"
      lead_stage:
        | "new"
        | "interested"
        | "followup"
        | "hot"
        | "payment_pending"
        | "closed"
        | "lost"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      leave_type:
        | "casual"
        | "sick"
        | "paid"
        | "unpaid"
        | "comp_off"
        | "maternity"
        | "paternity"
      ledger_status: "accrued" | "approved" | "paid" | "cancelled"
      movement_type: "purchase_in" | "sale_out" | "transfer" | "adjustment"
      payment_direction: "in" | "out"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "upi"
        | "card"
        | "cheque"
        | "other"
      payout_status: "pending" | "paid" | "overdue"
      payroll_status: "draft" | "processing" | "paid" | "cancelled"
      po_status:
        | "draft"
        | "sent"
        | "partially_received"
        | "received"
        | "cancelled"
      pos_order_status: "draft" | "completed" | "cancelled" | "refunded"
      pos_payment_method:
        | "cash"
        | "upi"
        | "card"
        | "bank_transfer"
        | "wallet"
        | "credit"
      pos_payment_status: "unpaid" | "partial" | "paid" | "refunded"
      revenue_source:
        | "academy"
        | "inventory"
        | "franchise_fee"
        | "consulting"
        | "event"
        | "other"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
      warehouse_type: "dark_store" | "central_warehouse" | "outlet"
      webinar_platform: "zoom" | "google_meet" | "youtube" | "teams" | "other"
      webinar_status: "draft" | "scheduled" | "live" | "completed" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "founder",
        "franchisee",
        "sales",
        "accounts",
        "inventory",
        "academy_admin",
        "webinar",
        "hr",
        "white_label",
        "trainer",
        "support",
        "package_sales",
        "nail_emporium",
        "state_franchisee",
        "academy_user",
        "dark_store_user",
        "salon_branch_user",
        "auditor",
      ],
      attendance_status: ["present", "absent", "late", "excused"],
      batch_mode: ["online", "offline", "hybrid"],
      batch_status: ["upcoming", "ongoing", "completed", "cancelled"],
      company_type: ["group", "distributor", "retailer", "operator"],
      course_status: ["draft", "published", "archived"],
      emp_attendance_status: [
        "present",
        "absent",
        "half_day",
        "leave",
        "holiday",
        "weekoff",
      ],
      employee_status: [
        "active",
        "on_leave",
        "suspended",
        "terminated",
        "resigned",
      ],
      employment_type: [
        "full_time",
        "part_time",
        "contract",
        "intern",
        "consultant",
      ],
      enrollment_status: ["active", "completed", "dropped", "suspended"],
      entity_type: [
        "company",
        "state_franchise",
        "city_franchise",
        "academy",
        "dark_store",
        "salon_branch",
        "department",
      ],
      expense_status: ["pending", "paid", "cancelled"],
      fee_status: ["pending", "paid", "partial", "overdue", "waived"],
      franchise_agreement_status: [
        "draft",
        "sent",
        "signed",
        "expired",
        "cancelled",
      ],
      franchise_mapping_type: ["company_direct", "master", "state", "city"],
      franchisee_document_kind: [
        "aadhaar",
        "pan",
        "gst",
        "agreement",
        "brochure",
        "photo",
        "bank",
        "other",
      ],
      franchisee_status: ["active", "onboarding", "suspended", "closed"],
      impersonation_mode: ["read_only", "read_write"],
      invoice_category: [
        "tns_turnover",
        "academy_sales",
        "mall_of_salon_sales",
        "franchise_fee",
        "royalty",
        "product_sales",
        "service_sales",
        "other",
        "membership",
      ],
      invoice_doc_type: [
        "b2b_tax",
        "b2c",
        "proforma",
        "quotation",
        "receipt",
        "credit_note",
        "debit_note",
      ],
      invoice_status: ["draft", "issued", "cancelled", "revised", "paid"],
      lead_source: [
        "meta",
        "google",
        "manual",
        "referral",
        "webinar",
        "website",
      ],
      lead_stage: [
        "new",
        "interested",
        "followup",
        "hot",
        "payment_pending",
        "closed",
        "lost",
      ],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      leave_type: [
        "casual",
        "sick",
        "paid",
        "unpaid",
        "comp_off",
        "maternity",
        "paternity",
      ],
      ledger_status: ["accrued", "approved", "paid", "cancelled"],
      movement_type: ["purchase_in", "sale_out", "transfer", "adjustment"],
      payment_direction: ["in", "out"],
      payment_method: [
        "cash",
        "bank_transfer",
        "upi",
        "card",
        "cheque",
        "other",
      ],
      payout_status: ["pending", "paid", "overdue"],
      payroll_status: ["draft", "processing", "paid", "cancelled"],
      po_status: [
        "draft",
        "sent",
        "partially_received",
        "received",
        "cancelled",
      ],
      pos_order_status: ["draft", "completed", "cancelled", "refunded"],
      pos_payment_method: [
        "cash",
        "upi",
        "card",
        "bank_transfer",
        "wallet",
        "credit",
      ],
      pos_payment_status: ["unpaid", "partial", "paid", "refunded"],
      revenue_source: [
        "academy",
        "inventory",
        "franchise_fee",
        "consulting",
        "event",
        "other",
      ],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
      warehouse_type: ["dark_store", "central_warehouse", "outlet"],
      webinar_platform: ["zoom", "google_meet", "youtube", "teams", "other"],
      webinar_status: ["draft", "scheduled", "live", "completed", "cancelled"],
    },
  },
} as const
