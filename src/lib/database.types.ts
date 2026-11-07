/* Generated from the migration. Run npm run db:types after schema changes. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Database = {
  public: {
    Tables: {
      coach_athletes: {
        Row: { coach_id: string; athlete_id: string; accepted: boolean; created_at: string };
        Insert: { coach_id: string; athlete_id: string; accepted?: boolean; created_at?: string };
        Update: { coach_id?: string; athlete_id?: string; accepted?: boolean; created_at?: string };
        Relationships: [
          {
            foreignKeyName: 'coach_athletes_athlete_id_fkey';
            columns: ['athlete_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_athletes_coach_id_fkey';
            columns: ['coach_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_results: {
        Row: {
          entry_id: string;
          completed: boolean;
          load: string;
          notes: string;
          metrics: Json;
          updated_at: string;
        };
        Insert: {
          entry_id: string;
          completed?: boolean;
          load?: string;
          notes?: string;
          metrics?: Json;
          updated_at?: string;
        };
        Update: {
          entry_id?: string;
          completed?: boolean;
          load?: string;
          notes?: string;
          metrics?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exercise_results_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'session_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      exercises: {
        Row: {
          id: string;
          owner_id: string;
          exercise_key: string;
          name: string;
          aliases: string[];
          reference_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          exercise_key: string;
          name: string;
          aliases?: string[];
          reference_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          exercise_key?: string;
          name?: string;
          aliases?: string[];
          reference_url?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exercises_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: { id: string; name: string; timezone: string; created_at: string };
        Insert: { id: string; name?: string; timezone?: string; created_at?: string };
        Update: { id?: string; name?: string; timezone?: string; created_at?: string };
        Relationships: [];
      };
      program_assignments: {
        Row: {
          id: string;
          program_id: string;
          program_version: number;
          coach_id: string;
          athlete_id: string;
          start_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          program_version: number;
          coach_id: string;
          athlete_id: string;
          start_date: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          program_version?: number;
          coach_id?: string;
          athlete_id?: string;
          start_date?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'program_assignments_athlete_id_fkey';
            columns: ['athlete_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_assignments_coach_id_fkey';
            columns: ['coach_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_assignments_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      program_weeks: {
        Row: { id: string; program_id: string; week_number: number };
        Insert: { id?: string; program_id: string; week_number: number };
        Update: { id?: string; program_id?: string; week_number?: number };
        Relationships: [
          {
            foreignKeyName: 'program_weeks_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      programs: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          description: string;
          checksum: string;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description?: string;
          checksum: string;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          description?: string;
          checksum?: string;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'programs_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      session_blocks: {
        Row: {
          id: string;
          session_id: string;
          position: number;
          label: string;
          kind: string;
          instructions: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          position: number;
          label: string;
          kind: string;
          instructions: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          position?: number;
          label?: string;
          kind?: string;
          instructions?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_blocks_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'workout_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      session_entries: {
        Row: {
          id: string;
          block_id: string;
          exercise_id: string;
          position: number;
          label: string;
          name: string;
          reference_url: string | null;
          eligible: boolean;
          prescription: Json;
          instructions: string;
        };
        Insert: {
          id?: string;
          block_id: string;
          exercise_id: string;
          position: number;
          label: string;
          name: string;
          reference_url?: string | null;
          eligible: boolean;
          prescription: Json;
          instructions: string;
        };
        Update: {
          id?: string;
          block_id?: string;
          exercise_id?: string;
          position?: number;
          label?: string;
          name?: string;
          reference_url?: string | null;
          eligible?: boolean;
          prescription?: Json;
          instructions?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_entries_block_id_fkey';
            columns: ['block_id'];
            isOneToOne: false;
            referencedRelation: 'session_blocks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_entries_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      sync_receipts: {
        Row: {
          mutation_id: string;
          athlete_id: string;
          session_id: string;
          version: number;
          created_at: string;
        };
        Insert: {
          mutation_id: string;
          athlete_id: string;
          session_id: string;
          version: number;
          created_at?: string;
        };
        Update: {
          mutation_id?: string;
          athlete_id?: string;
          session_id?: string;
          version?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sync_receipts_athlete_id_fkey';
            columns: ['athlete_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sync_receipts_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'workout_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      template_blocks: {
        Row: {
          id: string;
          workout_id: string;
          position: number;
          label: string;
          kind: string;
          instructions: string;
        };
        Insert: {
          id?: string;
          workout_id: string;
          position: number;
          label?: string;
          kind: string;
          instructions?: string;
        };
        Update: {
          id?: string;
          workout_id?: string;
          position?: number;
          label?: string;
          kind?: string;
          instructions?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'template_blocks_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workout_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      template_entries: {
        Row: {
          id: string;
          block_id: string;
          exercise_id: string;
          position: number;
          label: string;
          eligible: boolean;
          prescription: Json;
          instructions: string;
        };
        Insert: {
          id?: string;
          block_id: string;
          exercise_id: string;
          position: number;
          label?: string;
          eligible?: boolean;
          prescription?: Json;
          instructions?: string;
        };
        Update: {
          id?: string;
          block_id?: string;
          exercise_id?: string;
          position?: number;
          label?: string;
          eligible?: boolean;
          prescription?: Json;
          instructions?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'template_entries_block_id_fkey';
            columns: ['block_id'];
            isOneToOne: false;
            referencedRelation: 'template_blocks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'template_entries_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      user_roles: {
        Row: { user_id: string; role: string };
        Insert: { user_id: string; role: string };
        Update: { user_id?: string; role?: string };
        Relationships: [
          {
            foreignKeyName: 'user_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_sessions: {
        Row: {
          id: string;
          assignment_id: string | null;
          athlete_id: string;
          template_id: string | null;
          scheduled_date: string;
          title: string;
          status: string;
          finished_at: string | null;
          version: number;
          updated_at: string;
          description: string;
          category: string;
          estimated_minutes: number | null;
          withdrawn_at: string | null;
        };
        Insert: {
          id?: string;
          assignment_id?: string | null;
          athlete_id: string;
          template_id?: string | null;
          scheduled_date: string;
          title: string;
          status?: string;
          finished_at?: string | null;
          version?: number;
          updated_at?: string;
          description?: string;
          category?: string;
          estimated_minutes?: number | null;
          withdrawn_at?: string | null;
        };
        Update: {
          id?: string;
          assignment_id?: string | null;
          athlete_id?: string;
          template_id?: string | null;
          scheduled_date?: string;
          title?: string;
          status?: string;
          finished_at?: string | null;
          version?: number;
          updated_at?: string;
          description?: string;
          category?: string;
          estimated_minutes?: number | null;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_sessions_assignment_id_fkey';
            columns: ['assignment_id'];
            isOneToOne: false;
            referencedRelation: 'program_assignments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_sessions_athlete_id_fkey';
            columns: ['athlete_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_sessions_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'workout_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_templates: {
        Row: {
          id: string;
          week_id: string;
          day: number;
          position: number;
          title: string;
          description: string;
          category: string;
          estimated_minutes: number | null;
        };
        Insert: {
          id?: string;
          week_id: string;
          day: number;
          position: number;
          title: string;
          description?: string;
          category?: string;
          estimated_minutes?: number | null;
        };
        Update: {
          id?: string;
          week_id?: string;
          day?: number;
          position?: number;
          title?: string;
          description?: string;
          category?: string;
          estimated_minutes?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_templates_week_id_fkey';
            columns: ['week_id'];
            isOneToOne: false;
            referencedRelation: 'program_weeks';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [key in never]: never };
    Functions: {
      apply_session_mutation: {
        Args: { p_id: string; p_session: string; p_base_version: number; p_log: Json };
        Returns: number;
      };
      assign_program: {
        Args: { p_program: string; p_athlete: string; p_start: string };
        Returns: string;
      };
      can_read_athlete: { Args: { p_athlete: string }; Returns: boolean };
      get_my_sessions: { Args: Record<string, never>; Returns: Json };
      get_program: { Args: { p_id: string }; Returns: Json };
      has_role: { Args: { p_role: string }; Returns: boolean };
      remove_program: { Args: { p_program: string }; Returns: null };
      request_coaching: { Args: { p_athlete: string }; Returns: null };
      respond_coaching: { Args: { p_coach: string; p_accept: boolean }; Returns: null };
      save_program: { Args: { p_program: Json; p_replace?: string | null }; Returns: string };
    };
    Enums: { [key in never]: never };
    CompositeTypes: { [key in never]: never };
  };
};
