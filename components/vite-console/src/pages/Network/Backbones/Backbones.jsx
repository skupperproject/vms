import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import {
  Breadcrumb,
  BreadcrumbItem,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  Button,
  Modal,
  TextInput,
  Tag,
  InlineNotification,
  Loading,
  IconButton,
} from "@carbon/react"
import { Add, TrashCan } from "@carbon/icons-react"
import OwnerGroupSelect from "../../../components/OwnerGroupSelect/OwnerGroupSelect"
import { CancelWatch, CreateWatch } from "../../../tools/watch"

const Backbones = () => {
  const navigate = useNavigate()
  const [backbones, setBackbones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [backboneName, setBackboneName] = useState("")
  const [ownerGroup, setOwnerGroup] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [backboneToDelete, setBackboneToDelete] = useState(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  useEffect(() => {
    let watchContext
    let cancelled = false

    CreateWatch("/api/v1alpha1/backbones", function (message) {
      const body = message.body
      if (body.method === "GET" || body.method === "UPDATE") {
        if (body.statusCode >= 200 && body.statusCode < 300) {
          const sortedSites = [...body.content].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
          setBackbones(sortedSites)
          setLoading(false)
        } else {
          setError(body.content)
          setLoading(false)
        }
      }
    }).then((ctx) => {
      if (cancelled) {
        CancelWatch(ctx)
      } else {
        watchContext = ctx
      }
    })

    return () => {
      cancelled = true
      if (watchContext) {
        CancelWatch(watchContext)
      }
    }
  }, [])

  const handleCreateBackbone = async () => {
    if (!backboneName.trim()) {
      setCreateError("Please provide a backbone name")
      return
    }

    try {
      setIsCreating(true)
      setCreateError(null)

      const response = await fetch("/api/v1alpha1/backbones", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: backboneName.trim(),
          ownerGroup,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      // Reset form and close modal
      setBackboneName("")
      setOwnerGroup("")
      setIsModalOpen(false)
    } catch (err) {
      console.error("Error creating backbone:", err)
      setCreateError(err.message || "Failed to create backbone")
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteBackbone = async () => {
    if (!backboneToDelete || deleteConfirmName !== backboneToDelete.name) {
      setDeleteError("Backbone name does not match")
      return
    }

    try {
      setIsDeleting(true)
      setDeleteError(null)

      const response = await fetch(
        `/api/v1alpha1/backbones/${backboneToDelete.id}`,
        {
          method: "DELETE",
        },
      )

      if (!response.ok) {
        // Try to get error message from response body
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData = await response.text()
          if (errorData) {
            errorMessage = errorData
          }
        } catch (parseErr) {
          // If we can't parse the response, use the status message
          console.error("Error parsing error response:", parseErr)
        }
        throw new Error(errorMessage)
      }

      // Close modal and refresh
      setDeleteModalOpen(false)
      setBackboneToDelete(null)
      setDeleteConfirmName("")
    } catch (err) {
      console.error("Error deleting backbone:", err)
      setDeleteError(err.message || "Failed to delete backbone")
    } finally {
      setIsDeleting(false)
    }
  }

  const getLifecycleTagType = (lifecycle) => {
    switch (lifecycle?.toLowerCase()) {
      case "ready":
        return "green"
      case "new":
        return "blue"
      case "error":
      case "failed":
        return "red"
      default:
        return "gray"
    }
  }

  const headers = [
    { key: "name", header: "Name" },
    { key: "lifecycle", header: "Lifecycle" },
    { key: "id", header: "ID" },
    { key: "failure", header: "Status" },
    { key: "actions", header: "" },
  ]

  const rows = backbones.map((backbone) => ({
    id: backbone.id,
    name: backbone.name,
    lifecycle:
      backbone.lifecycle === "new" ? "Generating Certs" : backbone.lifecycle,
    failure: backbone.failure,
    actions: backbone,
  }))

  return (
    <div className="page-container">
      <Breadcrumb>
        <BreadcrumbItem href="/">Dashboard</BreadcrumbItem>
        <BreadcrumbItem href="/network/backbones">Network</BreadcrumbItem>
        <BreadcrumbItem href="/network/backbones" isCurrentPage>
          Backbones
        </BreadcrumbItem>
      </Breadcrumb>

      <div className="page-header">
        <h1>Backbone Networks</h1>
        <p>
          Manage network backbone configurations and connections. Click on a
          backbone to view its sites.
        </p>
      </div>

      {loading && (
        <Loading description="Loading backbones..." withOverlay={false} />
      )}

      {error && (
        <InlineNotification
          kind="error"
          title="Error loading backbones"
          subtitle={error}
          onCloseButtonClick={() => setError(null)}
          style={{ marginBottom: "1rem" }}
        />
      )}

      {!loading && !error && backbones.length === 0 && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Backbones</h3>
              <p
                style={{
                  color: "var(--cds-text-secondary)",
                  margin: "0.25rem 0 0 0",
                }}
              >
                No backbones configured
              </p>
            </div>
            <Button
              kind="primary"
              renderIcon={Add}
              onClick={() => setIsModalOpen(true)}
            >
              New Backbone
            </Button>
          </div>
          <InlineNotification
            kind="info"
            title="No backbone networks found"
            subtitle="Click 'New Backbone' to create your first backbone network."
            hideCloseButton
          />
        </div>
      )}

      {!loading && !error && backbones.length > 0 && (
        <DataTable rows={rows} headers={headers}>
          {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
            <TableContainer
              title="Backbone Networks"
              description="List of all backbone networks"
            >
              <TableToolbar>
                <TableToolbarContent>
                  <Button
                    kind="primary"
                    renderIcon={Add}
                    onClick={() => setIsModalOpen(true)}
                  >
                    New Backbone
                  </Button>
                </TableToolbarContent>
              </TableToolbar>
              <Table {...getTableProps()}>
                <TableHead>
                  <TableRow>
                    {headers.map((header) => (
                      <TableHeader
                        {...getHeaderProps({ header })}
                        key={header.key}
                      >
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      {...getRowProps({ row })}
                      key={row.id}
                      onClick={() => navigate(`/network/backbones/${row.id}`)}
                      style={{ cursor: "pointer" }}
                    >
                      {row.cells.map((cell) => {
                        if (cell.info.header === "lifecycle") {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={getLifecycleTagType(cell.value)}>
                                {cell.value || "unknown"}
                              </Tag>
                            </TableCell>
                          )
                        }
                        if (cell.info.header === "failure") {
                          return (
                            <TableCell key={cell.id}>
                              {cell.value ? (
                                <Tag type="red">{cell.value}</Tag>
                              ) : (
                                <Tag type="green">OK</Tag>
                              )}
                            </TableCell>
                          )
                        }
                        if (cell.info.header === "actions") {
                          return (
                            <TableCell
                              key={cell.id}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "flex-end",
                                }}
                              >
                                <IconButton
                                  kind="ghost"
                                  label="Delete backbone"
                                  tooltipPosition="top"
                                  onClick={() => {
                                    setBackboneToDelete(cell.value)
                                    setDeleteConfirmName("")
                                    setDeleteModalOpen(true)
                                    setDeleteError(null)
                                  }}
                                  size="sm"
                                >
                                  <TrashCan />
                                </IconButton>
                              </div>
                            </TableCell>
                          )
                        }
                        return <TableCell key={cell.id}>{cell.value}</TableCell>
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}

      <Modal
        open={isModalOpen}
        modalHeading="Create New Backbone"
        primaryButtonText="Create"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setIsModalOpen(false)
          setBackboneName("")
          setOwnerGroup("")
          setCreateError(null)
        }}
        onRequestSubmit={handleCreateBackbone}
        primaryButtonDisabled={isCreating || !backboneName.trim()}
      >
        {createError && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={createError}
            onCloseButtonClick={() => setCreateError(null)}
            style={{ marginBottom: "1rem" }}
          />
        )}

        <TextInput
          id="backbone-name"
          labelText="Backbone Name"
          placeholder="Enter backbone name"
          value={backboneName}
          onChange={(e) => setBackboneName(e.target.value)}
          disabled={isCreating}
          style={{ marginBottom: "1rem" }}
        />
        <OwnerGroupSelect
          id="backbone-owner-group"
          labelText="Owner group"
          value={ownerGroup}
          onChange={setOwnerGroup}
          disabled={isCreating}
          style={{ marginBottom: "1rem" }}
        />
      </Modal>

      <Modal
        open={deleteModalOpen}
        danger
        modalHeading="Delete Backbone"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        onRequestClose={() => {
          setDeleteModalOpen(false)
          setBackboneToDelete(null)
          setDeleteConfirmName("")
          setDeleteError(null)
        }}
        onRequestSubmit={handleDeleteBackbone}
        primaryButtonDisabled={
          isDeleting || deleteConfirmName !== backboneToDelete?.name
        }
      >
        {deleteError && (
          <InlineNotification
            kind="error"
            title="Error"
            subtitle={deleteError}
            onCloseButtonClick={() => setDeleteError(null)}
            style={{ marginBottom: "1rem" }}
          />
        )}

        <p style={{ marginBottom: "1rem" }}>
          Are you sure you want to delete the backbone{" "}
          <strong>{backboneToDelete?.name}</strong>? This will also delete all
          sites in this backbone. This action cannot be undone.
        </p>

        <p style={{ marginBottom: "1rem" }}>
          To confirm, please type the backbone name:{" "}
          <strong>{backboneToDelete?.name}</strong>
        </p>

        <TextInput
          id="delete-confirm-name"
          labelText="Backbone Name"
          placeholder="Type backbone name to confirm"
          value={deleteConfirmName}
          onChange={(e) => setDeleteConfirmName(e.target.value)}
          disabled={isDeleting}
          invalid={
            deleteConfirmName && deleteConfirmName !== backboneToDelete?.name
          }
          invalidText="Name does not match"
        />
      </Modal>
    </div>
  )
}

export default Backbones

// Made with Bob
