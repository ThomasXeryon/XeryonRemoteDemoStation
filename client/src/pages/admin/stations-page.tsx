import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Station } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Loader2, Trash2, Settings, Upload, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useEffect } from "react";
import { StatusIndicator } from "@/components/station-status";
import { cn } from "@/lib/utils";

export default function StationsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newStationName, setNewStationName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [port, setPort] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const { data: stations, isLoading } = useQuery<Station[]>({
    queryKey: ["/api/stations"],
  });

  const createStation = useMutation({
    mutationFn: async ({ name, ipAddress, port, secretKey }: { name: string; ipAddress: string; port: string; secretKey: string }) => {
      const res = await apiRequest("POST", "/api/admin/stations", { name, ipAddress, port, secretKey });
      const station = await res.json();

      // If we have a selected image, upload it right after creating the station
      if (selectedImage) {
        const formData = new FormData();
        formData.append('image', selectedImage);
        await fetch(`/api/admin/stations/${station.id}/image`, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
      }

      return station;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stations"] });
      toast({
        title: "Station created",
        description: "New demo station has been added successfully",
      });
      setNewStationName("");
      setIpAddress("");
      setPort("");
      setSecretKey("");
      setSelectedImage(null);
      setIsAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create station",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStation = useMutation({
    mutationFn: async (station: Station) => {
      const res = await apiRequest("PATCH", `/api/admin/stations/${station.id}`, {
        name: station.name,
        ipAddress: station.ipAddress,
        port: station.port,
        secretKey: station.secretKey,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stations"] });
      toast({
        title: "Station updated",
        description: "Station details have been updated successfully",
      });
      setSelectedStation(null);
      setIsEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update station",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteStation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/stations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stations"] });
      toast({
        title: "Station removed",
        description: "The demo station has been removed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove station",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadImage = useMutation({
    mutationFn: async ({ stationId, file }: { stationId: number; file: File }) => {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`/api/admin/stations/${stationId}/image`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to upload image');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stations"] });
      toast({
        title: "Image uploaded",
        description: "Preview image has been updated successfully",
      });
      setSelectedImage(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to upload image",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleStation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/stations/${id}`, {
        isActive
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stations"] });
      toast({
        title: "Station updated",
        description: "Station visibility has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update station",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStationClick = (station: Station) => {
    setSelectedStation(station);
    setIsEditDialogOpen(true);
  };

  if (!user?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardContent className="pt-6">
            <p>You don't have permission to access this page.</p>
            <Button className="mt-4" onClick={() => setLocation("/")}>
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => setLocation("/admin")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Manage Stations</h1>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4 mr-2" />
                Add Station
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Demo Station</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Station Name</Label>
                  <Input
                    id="name"
                    placeholder="Station Name"
                    value={newStationName}
                    onChange={(e) => setNewStationName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preview">Preview Image</Label>
                  <div className="flex items-center gap-4">
                    <Input
                      id="preview"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSelectedImage(file);
                        }
                      }}
                    />
                    {selectedImage && (
                      <div className="text-sm text-muted-foreground">
                        {selectedImage.name}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ip">IP Address</Label>
                  <Input
                    id="ip"
                    placeholder="IP Address (e.g. 192.168.1.100)"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    placeholder="Port (e.g. 8080)"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="secret">Secret Key</Label>
                  <Input
                    id="secret"
                    placeholder="Secret Key"
                    type="password"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full bg-primary hover:bg-primary/90 transition-colors"
                  onClick={() => createStation.mutate({ name: newStationName, ipAddress, port, secretKey })}
                  disabled={createStation.isPending || !newStationName.trim() || !ipAddress.trim() || !port.trim() || !secretKey.trim()}
                >
                  {createStation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create Station
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stations?.map((station) => (
            <Card
              key={station.id}
              className="hover:bg-accent/5 transition-colors group cursor-pointer"
              onClick={() => handleStationClick(station)}
            >
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{station.name}</span>
                  <div className="flex items-center gap-2">
                    <label
                      className="cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            uploadImage.mutate({ stationId: station.id, file });
                          }
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-colors"
                        title="Upload preview image"
                        disabled={uploadImage.isPending}
                      >
                        {uploadImage.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                      </Button>
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8 opacity-0 group-hover:opacity-100 transition-all",
                        station.isActive
                          ? "hover:bg-destructive hover:text-destructive-foreground"
                          : "hover:bg-primary hover:text-primary-foreground"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStation.mutate({ id: station.id, isActive: !station.isActive });
                      }}
                      disabled={toggleStation.isPending}
                      title={station.isActive ? "Disable station" : "Enable station"}
                    >
                      {toggleStation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : station.isActive ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteStation.mutate(station.id);
                      }}
                      disabled={deleteStation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {station.previewImage && (
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                      <img
                        src={station.previewImage}
                        alt={`${station.name} preview`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-accent/5 group-hover:bg-accent/10 transition-colors">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <StatusIndicator
                      status={station.status as "available" | "in_use" | "connecting"}
                    />
                  </div>
                  {station.ipAddress && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IP Address</span>
                      <span>{station.ipAddress}</span>
                    </div>
                  )}
                  {station.port && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Port</span>
                      <span>{station.port}</span>
                    </div>
                  )}
                  {station.currentUserId && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current Session</span>
                      <span>Active</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      {/* Edit Station Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Station</DialogTitle>
          </DialogHeader>
          {selectedStation && (
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Station Name</Label>
                <Input
                  id="edit-name"
                  placeholder="Station Name"
                  value={selectedStation.name}
                  onChange={(e) => setSelectedStation({ ...selectedStation, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ip">IP Address</Label>
                <Input
                  id="edit-ip"
                  placeholder="IP Address (e.g. 192.168.1.100)"
                  value={selectedStation.ipAddress || ""}
                  onChange={(e) => setSelectedStation({ ...selectedStation, ipAddress: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-port">Port</Label>
                <Input
                  id="edit-port"
                  placeholder="Port (e.g. 8080)"
                  value={selectedStation.port || ""}
                  onChange={(e) => setSelectedStation({ ...selectedStation, port: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-secret">Secret Key</Label>
                <Input
                  id="edit-secret"
                  placeholder="Secret Key"
                  type="password"
                  value={selectedStation.secretKey || ""}
                  onChange={(e) => setSelectedStation({ ...selectedStation, secretKey: e.target.value })}
                />
              </div>
              <Button
                className="w-full bg-primary hover:bg-primary/90 transition-colors"
                onClick={() => updateStation.mutate(selectedStation)}
                disabled={updateStation.isPending}
              >
                {updateStation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Settings className="h-4 w-4 mr-2" />
                )}
                Update Station
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}