/// <reference types="@sveltejs/kit" />

declare global {
  namespace App {
    interface Locals {
      user: {
        isLoggedIn: boolean;
      } | null;
    }
    // interface Error {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
