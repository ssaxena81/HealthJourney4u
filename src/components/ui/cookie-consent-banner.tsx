
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ShieldCheck, BarChart2, Settings2, X } from 'lucide-react';

const COOKIE_CONSENT_KEY = 'cookie_consent_preferences';
const CONSENT_VERSION = '1'; // Increment if policy changes significantly

interface CookiePreferences {
  version: string;
  strictlyNecessary: true; // Always true
  analytics: boolean;
  preferences: boolean;
  // Add more categories as needed
}

const initialPreferences: CookiePreferences = {
  version: CONSENT_VERSION,
  strictlyNecessary: true,
  analytics: true, // Default to opt-in for optional cookies
  preferences: true,
};

export default function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(initialPreferences);

  useEffect(() => {
    try {
      const storedConsent = localStorage.getItem(COOKIE_CONSENT_KEY);
      if (storedConsent) {
        const parsedConsent = JSON.parse(storedConsent) as CookiePreferences;
        // If consent version mismatch, or if it's an old format, show banner again
        if (parsedConsent.version !== CONSENT_VERSION || typeof parsedConsent.strictlyNecessary === 'undefined') {
          localStorage.removeItem(COOKIE_CONSENT_KEY); // Clear old consent
          setIsVisible(true);
          setPreferences(initialPreferences); // Reset to defaults
        } else {
          setIsVisible(false); // User has already consented with current version
          setPreferences(parsedConsent);
        }
      } else {
        setIsVisible(true); // No consent stored
        setPreferences(initialPreferences);
      }
    } catch (error) {
      console.error("Error accessing localStorage for cookie consent:", error);
      setIsVisible(true); // Fallback to showing banner if localStorage fails
      setPreferences(initialPreferences);
    }
  }, []);

  const savePreferences = useCallback((newPrefs: CookiePreferences) => {
    try {
      const prefsToSave = { ...newPrefs, version: CONSENT_VERSION, strictlyNecessary: true };
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(prefsToSave));
      setPreferences(prefsToSave);
      setIsVisible(false);
      setShowCustomize(false);
      // You might want to dispatch an event or call a function here if other parts of the app
      // need to react to consent changes (e.g., initializing analytics scripts).
      console.log("Cookie preferences saved:", prefsToSave);
    } catch (error) {
      console.error("Error saving cookie preferences to localStorage:", error);
    }
  }, []);

  const handleAcceptAll = () => {
    savePreferences({
      ...initialPreferences, // All optional cookies enabled by default
      strictlyNecessary: true,
      version: CONSENT_VERSION,
    });
  };

  const handleSaveCustom = () => {
    savePreferences(preferences);
  };
  
  const handleDeclineNonEssential = () => {
     savePreferences({
      version: CONSENT_VERSION,
      strictlyNecessary: true,
      analytics: false,
      preferences: false,
    });
  };

  const handlePreferenceChange = (category: keyof Omit<CookiePreferences, 'version' | 'strictlyNecessary'>, value: boolean) => {
    setPreferences(prev => ({ ...prev, [category]: value }));
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] p-4 bg-background/95 backdrop-blur-sm border-t border-border shadow-2xl">
      <div className="container mx-auto">
        {!showCustomize ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-foreground space-y-1">
              <p className="font-semibold">Our Cookie Policy</p>
              <p>
                We use cookies to ensure the basic functionality of our website and to enhance your experience.
                You can choose for each category to opt-in/out whenever you want. For more details, read our full (cookie policy placeholder).
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full sm:w-auto">
              <Button onClick={handleAcceptAll} size="sm" className="w-full sm:w-auto">Accept All</Button>
              <Button variant="outline" onClick={() => setShowCustomize(true)} size="sm" className="w-full sm:w-auto">Customize</Button>
              <Button variant="ghost" onClick={handleDeclineNonEssential} size="sm" className="w-full sm:w-auto text-xs">Decline Non-Essential</Button>
            </div>
          </div>
        ) : (
          <Card className="w-full shadow-none border-none bg-transparent">
            <CardHeader className="px-0 pt-0 pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Customize Cookie Preferences</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowCustomize(false)} className="h-7 w-7">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription className="text-xs">
                Manage your cookie settings. Some cookies are strictly necessary for the website to function.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-2 space-y-3">
              <div className="flex items-start space-x-3 p-3 border rounded-md bg-muted/30">
                <ShieldCheck className="h-5 w-5 text-primary mt-1" />
                <div className="flex-1">
                  <Label htmlFor="strictlyNecessary" className="font-semibold">Strictly Necessary</Label>
                  <p className="text-xs text-muted-foreground">These cookies are essential for the website to function properly, such as for authentication and security. They cannot be disabled.</p>
                </div>
                <Checkbox id="strictlyNecessary" checked={true} disabled className="cursor-not-allowed" />
              </div>

              <div className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                <BarChart2 className="h-5 w-5 text-accent mt-1" />
                <div className="flex-1">
                  <Label htmlFor="analyticsCookies" className="font-semibold">Analytics Cookies</Label>
                  <p className="text-xs text-muted-foreground">These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously.</p>
                </div>
                <Checkbox id="analyticsCookies" checked={preferences.analytics} onCheckedChange={(checked) => handlePreferenceChange('analytics', !!checked)} />
              </div>

              <div className="flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                <Settings2 className="h-5 w-5 text-accent mt-1" />
                <div className="flex-1">
                  <Label htmlFor="preferencesCookies" className="font-semibold">Preferences Cookies</Label>
                  <p className="text-xs text-muted-foreground">These cookies enable the website to remember information that changes the way the website behaves or looks, like your preferred language or region.</p>
                </div>
                <Checkbox id="preferencesCookies" checked={preferences.preferences} onCheckedChange={(checked) => handlePreferenceChange('preferences', !!checked)} />
              </div>
            </CardContent>
            <CardFooter className="px-0 pt-3 pb-0 flex justify-end">
              <Button onClick={handleSaveCustom} size="sm">Save Preferences</Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
