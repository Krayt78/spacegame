'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  ResourceDisplay,
  ProgressBar,
} from '@/components/ui';

export default function TestComponentsPage() {
  const [loading, setLoading] = useState(false);
  const [resourceAmount, setResourceAmount] = useState(12450);

  const handleLoadingClick = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  const handleAddResources = () => {
    setResourceAmount((prev) => prev + 1000);
  };

  return (
    <main className="min-h-screen bg-bg-primary p-8">
      <div className="max-w-6xl mx-auto space-y-16">
        {/* Page Title */}
        <div>
          <h1 className="font-display text-4xl font-bold text-accent-primary mb-2">
            UI COMPONENTS TEST
          </h1>
          <p className="text-text-secondary">
            Showcasing all Nexus Protocol UI components
          </p>
        </div>

        {/* Buttons Section */}
        <section>
          <h2 className="font-display text-2xl text-text-primary mb-6 uppercase tracking-wider">
            Buttons
          </h2>

          <div className="space-y-8">
            {/* Variants */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                Variants
              </h3>
              <div className="flex flex-wrap gap-4">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
            </div>

            {/* Sizes */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                Sizes
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
            </div>

            {/* States */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                States
              </h3>
              <div className="flex flex-wrap gap-4">
                <Button disabled>Disabled</Button>
                <Button isLoading={loading} onClick={handleLoadingClick}>
                  {loading ? 'Processing...' : 'Click for Loading'}
                </Button>
                <Button variant="danger" isLoading>
                  Always Loading
                </Button>
              </div>
            </div>

            {/* With Icons */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                With Icons
              </h3>
              <div className="flex flex-wrap gap-4">
                <Button leftIcon={<span>🚀</span>}>Launch Fleet</Button>
                <Button variant="secondary" rightIcon={<span>→</span>}>
                  Continue
                </Button>
                <Button
                  variant="danger"
                  leftIcon={<span>⚠️</span>}
                  rightIcon={<span>💥</span>}
                >
                  Self Destruct
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Cards Section */}
        <section>
          <h2 className="font-display text-2xl text-text-primary mb-6 uppercase tracking-wider">
            Cards
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Basic Card */}
            <Card>
              <CardHeader title="Fleet Status" subtitle="Sector Alpha-7" />
              <CardContent>
                <div className="space-y-2">
                  <p>Active ships: 24</p>
                  <p>In transit: 3</p>
                  <p>Docked: 21</p>
                </div>
              </CardContent>
              <CardFooter>
                <Button size="sm">View Details</Button>
                <Button size="sm" variant="ghost">
                  Dismiss
                </Button>
              </CardFooter>
            </Card>

            {/* Card with Glow */}
            <Card glow>
              <CardHeader
                title="Titanium Extractor"
                subtitle="Level 5"
                action={<span className="text-accent-primary">+30/hr</span>}
              />
              <CardContent>
                <div className="space-y-2">
                  <p>Production: 30 units/hr</p>
                  <p>Efficiency: 92%</p>
                  <p>Upgrade cost: 5,000 Ti</p>
                </div>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="primary">
                  Upgrade
                </Button>
              </CardFooter>
            </Card>

            {/* Card with Grid */}
            <Card showGrid glow>
              <CardHeader title="Research Lab" subtitle="Active Research" />
              <CardContent>
                <div className="space-y-3">
                  <p className="text-accent-secondary">Plasma Shields II</p>
                  <ProgressBar
                    progress={67}
                    size="sm"
                    variant="success"
                    showPercentage
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="secondary">
                  Cancel
                </Button>
                <Button size="sm" variant="ghost">
                  Queue
                </Button>
              </CardFooter>
            </Card>

            {/* Different Padding */}
            <Card padding="sm">
              <CardContent>
                <p className="text-sm">Small padding card</p>
              </CardContent>
            </Card>

            <Card padding="lg">
              <CardContent>
                <p>Large padding card with more breathing room</p>
              </CardContent>
            </Card>

            {/* Card without header/footer */}
            <Card glow showGrid>
              <CardContent>
                <div className="text-center py-4">
                  <span className="text-4xl">🛸</span>
                  <p className="text-text-primary mt-2 font-display">
                    INCOMING TRANSMISSION
                  </p>
                  <p className="text-text-muted text-sm mt-1">
                    Encrypted signal detected
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Resource Display Section */}
        <section>
          <h2 className="font-display text-2xl text-text-primary mb-6 uppercase tracking-wider">
            Resource Display
          </h2>

          <div className="space-y-8">
            {/* All Resources - Medium */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                All Resources (Medium)
              </h3>
              <div className="flex flex-wrap gap-8">
                <ResourceDisplay
                  type="titanium"
                  amount={resourceAmount}
                  productionRate={1250}
                />
                <ResourceDisplay
                  type="helium3"
                  amount={89200}
                  productionRate={890}
                />
                <ResourceDisplay
                  type="darkMatter"
                  amount={4520}
                  productionRate={45}
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="mt-4"
                onClick={handleAddResources}
              >
                Add 1000 Titanium (Test Animation)
              </Button>
            </div>

            {/* Different Sizes */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                Sizes
              </h3>
              <div className="flex flex-wrap items-end gap-8">
                <div>
                  <p className="text-text-muted text-xs mb-2">Small</p>
                  <ResourceDisplay
                    type="titanium"
                    amount={5000}
                    productionRate={50}
                    size="sm"
                  />
                </div>
                <div>
                  <p className="text-text-muted text-xs mb-2">Medium</p>
                  <ResourceDisplay
                    type="helium3"
                    amount={5000}
                    productionRate={50}
                    size="md"
                  />
                </div>
                <div>
                  <p className="text-text-muted text-xs mb-2">Large</p>
                  <ResourceDisplay
                    type="darkMatter"
                    amount={5000}
                    productionRate={50}
                    size="lg"
                  />
                </div>
              </div>
            </div>

            {/* Without Icons */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                Without Icons
              </h3>
              <div className="flex flex-wrap gap-8">
              </div>
            </div>
          </div>
        </section>

        {/* Progress Bars Section */}
        <section>
          <h2 className="font-display text-2xl text-text-primary mb-6 uppercase tracking-wider">
            Progress Bars
          </h2>

          <div className="space-y-8 max-w-2xl">
            {/* Variants */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                Variants
              </h3>
              <div className="space-y-6">
                <ProgressBar
                  progress={75}
                  variant="default"
                  label="Default - Shield Charging"
                  showPercentage
                />
                <ProgressBar
                  progress={100}
                  variant="success"
                  label="Success - Download Complete"
                  showPercentage
                />
                <ProgressBar
                  progress={45}
                  variant="warning"
                  label="Warning - Fuel Reserves"
                  showPercentage
                />
                <ProgressBar
                  progress={15}
                  variant="danger"
                  label="Danger - Hull Integrity"
                  showPercentage
                />
              </div>
            </div>

            {/* With Time Remaining */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                With Countdown Timer
              </h3>
              <div className="space-y-6">
                <ProgressBar
                  progress={35}
                  variant="success"
                  label="Titanium Extractor Lv.6"
                  timeRemaining={3661}
                  showPercentage
                />
                <ProgressBar
                  progress={82}
                  variant="default"
                  label="Fleet Arrival"
                  timeRemaining={542}
                />
              </div>
            </div>

            {/* Sizes */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                Sizes
              </h3>
              <div className="space-y-6">
                <ProgressBar progress={60} size="sm" label="Small" />
                <ProgressBar progress={60} size="md" label="Medium" />
                <ProgressBar progress={60} size="lg" label="Large" />
              </div>
            </div>

            {/* Non-animated */}
            <div>
              <h3 className="text-text-secondary mb-4 text-sm uppercase tracking-wider">
                Static (No Animation)
              </h3>
              <ProgressBar
                progress={50}
                animated={false}
                label="Static Progress"
                showPercentage
              />
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-bg-tertiary pt-8 text-center">
          <p className="text-text-muted text-sm">
            Nexus Protocol UI Components v1.0
          </p>
        </footer>
      </div>
    </main>
  );
}
